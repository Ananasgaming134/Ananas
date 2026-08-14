import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  createTicketCategory,
  createTicketChannel,
  revokeChannelSendPermission,
  roleIdsFromEnv,
} from "@/lib/discord";
import { TICKET_CLAIM_PREFIX, TICKET_CLOSE_PREFIX } from "@/lib/discordInteractions";
import type { BotDeployment } from "@prisma/client";

export const TICKET_CATEGORY = { SUPPORT: "SUPPORT", BEWERBUNG: "BEWERBUNG" } as const;
export type TicketCategoryValue = (typeof TICKET_CATEGORY)[keyof typeof TICKET_CATEGORY];

export const TICKET_STATUS = { OPEN: "OPEN", CLAIMED: "CLAIMED", CLOSED: "CLOSED" } as const;

function claimRoleIdsFor(deployment: BotDeployment, category: TicketCategoryValue): string[] {
  const raw = category === TICKET_CATEGORY.SUPPORT ? deployment.supportClaimRoleIds : deployment.bewerbungClaimRoleIds;
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type CreateTicketInput = {
  category: TicketCategoryValue;
  subject: string;
  applicantDiscordId: string;
  memberId?: string | null;
  applicationId?: string | null;
  /** Zusaetzlicher Freitext (z.B. Support-Beschreibung), landet als erste Nachricht im Ticket-Kanal. */
  initialMessage?: string | null;
};

export type CreateTicketResult = { ok: true; ticketId: string } | { ok: false; error: string };

/**
 * Legt ein Ticket an und versucht best-effort, direkt den privaten
 * Discord-Kanal dafuer zu erstellen (braucht ein aktives BotDeployment mit
 * konfigurierter Ticket-Kategorie). Schlaegt die Discord-Seite fehl (z.B.
 * noch kein Bot eingerichtet), bleibt das Ticket trotzdem als DB-Eintrag
 * bestehen - discordChannelId bleibt dann leer, "In Discord öffnen" fehlt
 * auf der Website einfach.
 */
export async function createTicketCore(input: CreateTicketInput): Promise<CreateTicketResult> {
  const deployment = await prisma.botDeployment.findFirst({ where: { active: true } });

  const ticket = await prisma.ticket.create({
    data: {
      category: input.category,
      subject: input.subject.slice(0, 200),
      applicantDiscordId: input.applicantDiscordId,
      memberId: input.memberId ?? null,
      applicationId: input.applicationId ?? null,
      discordGuildId: deployment?.guildId ?? "",
    },
  });

  if (deployment) {
    await provisionTicketChannel(ticket.id, deployment, input.initialMessage ?? null).catch(() => {});
  }

  await logAction({
    targetId: input.memberId ?? null,
    action: "TICKET_CREATED",
    details: `Ticket "${ticket.subject}" (${input.category}) erstellt.`,
  });

  return { ok: true, ticketId: ticket.id };
}

/**
 * Erstellt (falls noch nicht vorhanden) die Ticket-Kategorie und danach den
 * eigentlichen privaten Kanal fuer ein bereits angelegtes Ticket. Getrennt
 * von createTicketCore, damit ein spaeter eingerichteter Bot ein zuvor ohne
 * Kanal angelegtes Ticket nachtraeglich bekommen koennte (aktuell nicht
 * automatisch verdrahtet, aber sauber trennbar).
 */
async function provisionTicketChannel(
  ticketId: string,
  deployment: BotDeployment,
  initialMessage: string | null
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.discordChannelId) return;

  let categoryId = deployment.ticketCategoryId;
  if (!categoryId) {
    const category = await createTicketCategory(deployment.guildId);
    if (category.ok) {
      categoryId = category.categoryId;
      await prisma.botDeployment.update({
        where: { id: deployment.id },
        data: { ticketCategoryId: categoryId },
      });
    }
  }

  const claimRoleIds = claimRoleIdsFor(deployment, ticket.category as TicketCategoryValue);
  const prefix = ticket.category === TICKET_CATEGORY.BEWERBUNG ? "bewerbung" : "ticket";
  const channelName = `${prefix}-${ticket.id.slice(-6)}`;

  const result = await createTicketChannel(
    deployment.guildId,
    categoryId,
    channelName,
    ticket.applicantDiscordId,
    claimRoleIds
  );
  if (!result.ok) return;

  await prisma.ticket.update({ where: { id: ticket.id }, data: { discordChannelId: result.channelId } });

  let content = buildTicketIntro(ticket.category as TicketCategoryValue, ticket.subject);
  if (initialMessage) content += `\n\n${initialMessage}`;

  await fetch(`https://discord.com/api/v10/channels/${result.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "🙋 Übernehmen", custom_id: `${TICKET_CLAIM_PREFIX}${ticket.id}` },
            { type: 2, style: 4, label: "🔒 Schließen", custom_id: `${TICKET_CLOSE_PREFIX}${ticket.id}` },
          ],
        },
      ],
    }),
  }).catch(() => {});
}

function buildTicketIntro(category: TicketCategoryValue, subject: string): string {
  return category === TICKET_CATEGORY.BEWERBUNG
    ? `📝 **Neue Bewerbung** — ${subject}\nDetails stehen in der Bewerbungs-Übersicht auf der Website (Verwaltung → Bewerbungen).`
    : `🎧 **Neues Support-Ticket** — ${subject}`;
}

export type TicketActionResult = { ok: true } | { ok: false; error: string };

/** Prueft, ob eine Person (Owner oder eine der Claim-Rollen) ein Ticket dieser Kategorie claimen/bearbeiten darf. */
export function canManageTicket(
  category: TicketCategoryValue,
  deployment: Pick<BotDeployment, "supportClaimRoleIds" | "bewerbungClaimRoleIds">,
  memberRoles: string[]
): boolean {
  const ownerIds = roleIdsFromEnv("DISCORD_ROLE_OWNER");
  if (memberRoles.some((r) => ownerIds.includes(r))) return true;

  const raw = category === TICKET_CATEGORY.SUPPORT ? deployment.supportClaimRoleIds : deployment.bewerbungClaimRoleIds;
  const claimRoleIds = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return memberRoles.some((r) => claimRoleIds.includes(r));
}

export async function claimTicketCore(ticketId: string, actorId: string): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TICKET_STATUS.CLAIMED, claimedById: actorId, claimedAt: new Date() },
  });
  await logAction({ actorId, action: "TICKET_CLAIMED", details: `Ticket "${ticket.subject}" übernommen.` });
  return { ok: true };
}

export async function closeTicketCore(ticketId: string, actorId: string): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TICKET_STATUS.CLOSED, closedById: actorId, closedAt: new Date() },
  });

  if (ticket.discordChannelId) {
    await revokeChannelSendPermission(ticket.discordChannelId, ticket.applicantDiscordId).catch(() => {});
  }

  await logAction({ actorId, action: "TICKET_CLOSED", details: `Ticket "${ticket.subject}" geschlossen.` });
  return { ok: true };
}
