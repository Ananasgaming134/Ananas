import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { DISCORD_GUILD_ID, grantGuildRole, roleIdsFromEnv } from "@/lib/discord";
import { generateCustomerNumber } from "@/lib/customerNumber";
import { startGracePeriodIfNeeded } from "@/lib/accessControl";
import { TICKET_CATEGORY, closeTicketCore, createTicketCore } from "@/lib/tickets";
import { MEMBER_STATUS, ROLES, getSubscriptionPlan } from "@/lib/constants";

export type ApplicationItemInput = {
  sourceKey?: string | null;
  name: string;
  declaredPrice: number;
  quantity: number;
};

export type CreateApplicationInput = {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  reason: string;
  declaredNetWorth: number;
  requestedPlanId: string;
  source: "WEB" | "DISCORD";
  minecraftName: string;
  age: number;
  playHours: number;
  items?: ApplicationItemInput[];
};

export type CreateApplicationResult = { ok: true; applicationId: string } | { ok: false; error: string };

/**
 * Ein Eintrag greift nur, solange er nicht abgelaufen ist. expiresAt = null
 * ist die dauerhafte rote Liste, ein Datum eine befristete Aufnahmesperre
 * (z.B. 6 Monate) - danach darf sich die Person wieder bewerben, ohne dass
 * jemand den Eintrag manuell entfernen muss.
 */
export function isBlockActive(block: { expiresAt: Date | null }): boolean {
  return !block.expiresAt || block.expiresAt > new Date();
}

/**
 * Kernlogik zum Einreichen einer Kunden-Bewerbung - genutzt von der
 * Website (/bewerbung) UND vom Discord-Befehl /bewerben. Prueft rote Liste,
 * bereits aktive Mitgliedschaft und doppelte offene Bewerbungen.
 */
export async function createApplicationCore(input: CreateApplicationInput): Promise<CreateApplicationResult> {
  const plan = getSubscriptionPlan(input.requestedPlanId);
  if (!plan) return { ok: false, error: "Ungültiges Abo-Paket." };

  const blocked = await prisma.applicationBlock.findUnique({ where: { discordId: input.discordId } });
  if (blocked && isBlockActive(blocked)) {
    return {
      ok: false,
      error: blocked.expiresAt
        ? `Du hast eine Aufnahmesperre bis ${blocked.expiresAt.toLocaleDateString("de-DE")} - danach kannst du dich wieder bewerben.`
        : "Für diesen Account ist keine erneute Bewerbung möglich.",
    };
  }

  const existingMember = await prisma.member.findUnique({ where: { discordId: input.discordId } });
  if (existingMember?.status === MEMBER_STATUS.ACTIVE) {
    return { ok: false, error: "Du bist bereits aktives Mitglied." };
  }

  const pending = await prisma.membershipApplication.findFirst({
    where: { discordId: input.discordId, status: "PENDING" },
  });
  if (pending) return { ok: false, error: "Du hast bereits eine offene Bewerbung." };

  const application = await prisma.membershipApplication.create({
    data: {
      discordId: input.discordId,
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      reason: input.reason,
      declaredNetWorth: input.declaredNetWorth,
      requestedPlanId: input.requestedPlanId,
      source: input.source,
      minecraftName: input.minecraftName,
      age: input.age,
      playHours: input.playHours,
      items:
        input.items && input.items.length > 0
          ? {
              create: input.items.map((i) => ({
                sourceKey: i.sourceKey ?? null,
                name: i.name,
                declaredPrice: i.declaredPrice,
                quantity: i.quantity,
              })),
            }
          : undefined,
    },
  });

  await logAction({
    targetId: existingMember?.id ?? null,
    action: "APPLICATION_SUBMITTED",
    details: `Bewerbung von ${input.displayName} (@${input.username}) eingereicht — Paket ${plan.label} (${input.source}).`,
  });

  return { ok: true, applicationId: application.id };
}

/**
 * Wie createApplicationCore, legt zusaetzlich das zugehoerige
 * Bewerbungs-Ticket an (inkl. Discord-Kanal, best-effort) und verknuepft
 * es mit der Bewerbung. Gemeinsam genutzt von der Website
 * (applyForMembership) und dem Discord-Modal (/bewerben).
 */
export async function applyAndOpenTicketCore(input: CreateApplicationInput): Promise<CreateApplicationResult> {
  const result = await createApplicationCore(input);
  if (!result.ok) return result;

  const ticket = await createTicketCore({
    category: TICKET_CATEGORY.BEWERBUNG,
    subject: `Bewerbung von ${input.displayName}`,
    applicantDiscordId: input.discordId,
    applicationId: result.applicationId,
  });
  if (ticket.ok) {
    await prisma.membershipApplication
      .update({ where: { id: result.applicationId }, data: { ticketId: ticket.ticketId } })
      .catch(() => {});
  }

  return result;
}

export type ApproveApplicationResult = { ok: true; memberId: string } | { ok: false; error: string };

/**
 * Nimmt eine Bewerbung an: legt den Member an (oder aktiviert ihn erneut),
 * setzt das gewuenschte Abo-Paket (Zahlung ist damit faellig, feePaidUntil
 * bleibt bewusst unveraendert/leer), vergibt live die Kunde-Rolle in Discord
 * und schliesst das verknuepfte Bewerbungs-Ticket. Nur vom Owner aufrufbar
 * (Berechtigung wird vom Aufrufer geprueft, siehe Plan).
 */
export async function approveApplicationCore(
  applicationId: string,
  actorId: string
): Promise<ApproveApplicationResult> {
  const application = await prisma.membershipApplication.findUnique({ where: { id: applicationId } });
  if (!application) return { ok: false, error: "Bewerbung nicht gefunden." };
  if (application.status !== "PENDING") return { ok: false, error: "Bewerbung wurde bereits bearbeitet." };

  const plan = getSubscriptionPlan(application.requestedPlanId);
  if (!plan) return { ok: false, error: "Ungültiges Abo-Paket in der Bewerbung." };

  const existing = await prisma.member.findUnique({ where: { discordId: application.discordId } });

  const member = existing
    ? await prisma.member.update({
        where: { id: existing.id },
        data: {
          role: ROLES.KUNDE,
          status: MEMBER_STATUS.ACTIVE,
          subscriptionPlan: plan.id,
          monthlyFee: plan.price,
          minecraftName: application.minecraftName,
          age: application.age,
          playHours: application.playHours,
          revokedAt: null,
          revokedReason: null,
        },
      })
    : await prisma.member.create({
        data: {
          discordId: application.discordId,
          username: application.username,
          displayName: application.displayName,
          avatarUrl: application.avatarUrl,
          minecraftName: application.minecraftName,
          age: application.age,
          playHours: application.playHours,
          role: ROLES.KUNDE,
          status: MEMBER_STATUS.ACTIVE,
          subscriptionPlan: plan.id,
          monthlyFee: plan.price,
          customerNumber: await generateCustomerNumber(),
        },
      });

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date(), memberId: member.id },
  });

  if (application.ticketId) {
    await closeTicketCore(application.ticketId, actorId).catch(() => {});
  }

  // Rollenvergabe ist ein Zusatz - schlaegt sie fehl (z.B. Person hat den
  // Discord-Server verlassen), darf das die eigentliche Annahme nicht kippen.
  const kundeRoleId = roleIdsFromEnv("DISCORD_ROLE_KUNDE")[0];
  if (DISCORD_GUILD_ID && kundeRoleId) {
    await grantGuildRole(DISCORD_GUILD_ID, application.discordId, kundeRoleId).catch(() => {});
  }

  // Ab jetzt laeuft die 3-Stunden-Zahlungsfrist: ohne Abo-Abschluss wird die
  // gerade vergebene Rolle automatisch wieder entzogen.
  await startGracePeriodIfNeeded(member.id).catch(() => {});

  await logAction({
    actorId,
    targetId: member.id,
    action: "APPLICATION_APPROVED",
    details: `Bewerbung angenommen — Paket ${plan.label}, Zahlung jetzt fällig.`,
  });

  return { ok: true, memberId: member.id };
}

export type ApplicationActionResult = { ok: true } | { ok: false; error: string };

export async function rejectApplicationCore(
  applicationId: string,
  reason: string,
  actorId: string
): Promise<ApplicationActionResult> {
  const application = await prisma.membershipApplication.findUnique({ where: { id: applicationId } });
  if (!application) return { ok: false, error: "Bewerbung nicht gefunden." };
  if (application.status !== "PENDING") return { ok: false, error: "Bewerbung wurde bereits bearbeitet." };

  await prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { status: "REJECTED", rejectionReason: reason, reviewedById: actorId, reviewedAt: new Date() },
  });

  if (application.ticketId) {
    await closeTicketCore(application.ticketId, actorId).catch(() => {});
  }

  await logAction({
    actorId,
    action: "APPLICATION_REJECTED",
    details: `Bewerbung von ${application.displayName} (@${application.username}) abgelehnt: ${reason}`,
  });

  return { ok: true };
}

/**
 * Sperrt eine Discord-ID fuer Bewerbungen - lehnt eine evtl. noch offene
 * Bewerbung mit ab. Ohne `months` ist es die dauerhafte rote Liste (blockiert
 * zusaetzlich den Login selbst, siehe auth.ts); mit `months` eine befristete
 * Aufnahmesperre, die von allein auslaeuft.
 */
export async function blockApplicantCore(
  discordId: string,
  reason: string,
  actorId: string,
  months?: number | null
): Promise<ApplicationActionResult> {
  const pending = await prisma.membershipApplication.findFirst({ where: { discordId, status: "PENDING" } });
  if (pending) {
    await rejectApplicationCore(pending.id, reason, actorId);
  }

  let expiresAt: Date | null = null;
  if (months && Number.isFinite(months) && months > 0) {
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }

  await prisma.applicationBlock.upsert({
    where: { discordId },
    create: { discordId, reason, blockedById: actorId, expiresAt },
    update: { reason, blockedById: actorId, blockedAt: new Date(), expiresAt },
  });

  await logAction({
    actorId,
    action: "APPLICANT_BLOCKED",
    details: expiresAt
      ? `Discord-ID ${discordId} mit Aufnahmesperre bis ${expiresAt.toLocaleDateString("de-DE")} belegt: ${reason}`
      : `Discord-ID ${discordId} auf die rote Liste gesetzt (dauerhaft): ${reason}`,
  });

  return { ok: true };
}

export async function unblockApplicantCore(blockId: string, actorId: string): Promise<ApplicationActionResult> {
  const block = await prisma.applicationBlock.findUnique({ where: { id: blockId } });
  if (!block) return { ok: false, error: "Eintrag nicht gefunden." };

  await prisma.applicationBlock.delete({ where: { id: blockId } });
  await logAction({
    actorId,
    action: "APPLICANT_UNBLOCKED",
    details: `Rote-Liste-Eintrag für Discord-ID ${block.discordId} entfernt.`,
  });

  return { ok: true };
}
