import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  createTicketCategory,
  createTicketChannel,
  ensureTicketQueueChannel,
  grantChannelMemberAccess,
  revokeChannelSendPermission,
  roleIdsFromEnv,
} from "@/lib/discord";
import { TICKET_CLAIM_PREFIX, TICKET_CLOSE_PREFIX } from "@/lib/discordInteractions";
import type { BotDeployment } from "@prisma/client";

const DISCORD_API = "https://discord.com/api/v10";

function authHeaders() {
  return { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
}

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
  const existingOpen = await prisma.ticket.findFirst({
    where: {
      applicantDiscordId: input.applicantDiscordId,
      category: input.category,
      status: { in: [TICKET_STATUS.OPEN, TICKET_STATUS.CLAIMED] },
    },
  });
  if (existingOpen) {
    return {
      ok: false,
      error: existingOpen.discordChannelId
        ? `Du hast bereits ein offenes Ticket dieser Art: <#${existingOpen.discordChannelId}>`
        : "Du hast bereits ein offenes Ticket dieser Art - bitte warte, bis es bearbeitet wurde.",
    };
  }

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

  const prefix = ticket.category === TICKET_CATEGORY.BEWERBUNG ? "bewerbung" : "ticket";
  const channelName = `${prefix}-${ticket.id.slice(-6)}`;

  const result = await createTicketChannel(deployment.guildId, categoryId, channelName, ticket.applicantDiscordId);
  if (!result.ok) return;

  await prisma.ticket.update({ where: { id: ticket.id }, data: { discordChannelId: result.channelId } });

  let content = buildTicketIntro(ticket.category as TicketCategoryValue, ticket.subject);
  if (initialMessage) content += `\n\n${initialMessage}`;

  await fetch(`${DISCORD_API}/channels/${result.channelId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      content,
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 4, label: "🔒 Schließen", custom_id: `${TICKET_CLOSE_PREFIX}${ticket.id}` }],
        },
      ],
    }),
  }).catch(() => {});

  await postToQueue(ticket.id, ticket.category as TicketCategoryValue, ticket.subject, deployment);
}

/**
 * Postet die Claim-Nachricht in die Warteschlange (falls konfiguriert bzw.
 * automatisch anlegbar) - getrennt vom privaten Ticket-Kanal. Erst durchs
 * Claimen dort bekommt eine einzelne Person individuellen Zugriff auf den
 * eigentlichen Ticket-Kanal (siehe claimTicketCore).
 */
async function postToQueue(
  ticketId: string,
  category: TicketCategoryValue,
  subject: string,
  deployment: BotDeployment
): Promise<void> {
  let queueChannelId = deployment.ticketQueueChannelId;
  if (!queueChannelId) {
    const allClaimRoleIds = [
      ...claimRoleIdsFor(deployment, TICKET_CATEGORY.SUPPORT),
      ...claimRoleIdsFor(deployment, TICKET_CATEGORY.BEWERBUNG),
    ];
    const created = await ensureTicketQueueChannel(deployment.guildId, [...new Set(allClaimRoleIds)]);
    if (!created.ok) return;
    queueChannelId = created.channelId;
    await prisma.botDeployment.update({ where: { id: deployment.id }, data: { ticketQueueChannelId: queueChannelId } });
  }

  const label = category === TICKET_CATEGORY.BEWERBUNG ? "📝 Bewerbung" : "🎧 Support";
  const res = await fetch(`${DISCORD_API}/channels/${queueChannelId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      content: `${label} — **${subject}**`,
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 3, label: "🙋 Claimen", custom_id: `${TICKET_CLAIM_PREFIX}${ticketId}` }],
        },
      ],
    }),
  }).catch(() => null);
  if (!res || !res.ok) return;

  const message = (await res.json()) as { id: string };
  await prisma.ticket.update({ where: { id: ticketId }, data: { queueMessageId: message.id } }).catch(() => {});
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

/**
 * Claimt ein Ticket: nur EINE Person kann das - ein bereits geclaimtes
 * Ticket ist fuer alle anderen gesperrt (nur Owner/aktueller Claimer koennen
 * per "/ticket add" weitere Personen hinzufuegen, siehe route.ts). Gibt dem
 * Claimer individuellen Zugriff auf den privaten Ticket-Kanal und entfernt
 * den Claim-Button aus der Warteschlangen-Nachricht.
 */
export async function claimTicketCore(ticketId: string, actorId: string): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };
  if (ticket.status === TICKET_STATUS.CLAIMED) return { ok: false, error: "Ticket wurde bereits von jemand anderem übernommen." };

  const actor = await prisma.member.findUnique({ where: { id: actorId } });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TICKET_STATUS.CLAIMED, claimedById: actorId, claimedAt: new Date() },
  });

  if (ticket.discordChannelId && actor) {
    await grantChannelMemberAccess(ticket.discordChannelId, actor.discordId).catch(() => {});
  }

  if (ticket.queueMessageId && ticket.discordGuildId) {
    const deployment = await prisma.botDeployment.findUnique({ where: { guildId: ticket.discordGuildId } });
    if (deployment?.ticketQueueChannelId) {
      await fetch(`${DISCORD_API}/channels/${deployment.ticketQueueChannelId}/messages/${ticket.queueMessageId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          content: `✅ Übernommen von ${actor?.displayName ?? "jemandem"} — **${ticket.subject}**`,
          components: [],
        }),
      }).catch(() => {});
    }
  }

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

  if (ticket.status !== TICKET_STATUS.CLAIMED && ticket.queueMessageId && ticket.discordGuildId) {
    const deployment = await prisma.botDeployment.findUnique({ where: { guildId: ticket.discordGuildId } });
    if (deployment?.ticketQueueChannelId) {
      await fetch(`${DISCORD_API}/channels/${deployment.ticketQueueChannelId}/messages/${ticket.queueMessageId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ content: `🔒 Geschlossen — **${ticket.subject}**`, components: [] }),
      }).catch(() => {});
    }
  }

  await logAction({ actorId, action: "TICKET_CLOSED", details: `Ticket "${ticket.subject}" geschlossen.` });
  return { ok: true };
}
