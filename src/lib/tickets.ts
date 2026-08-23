import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  TICKET_CLAIM_CHANNEL_ID,
  TICKET_CLAIM_ROLE_ID,
  TICKET_PANEL_CHANNEL_ID,
  addThreadMember,
  archiveThread,
  canClaimTicket,
  createTicketCategory,
  createTicketChannel,
  createTicketThread,
  ensureTicketQueueChannel,
  fetchChannelTranscript,
  grantChannelMemberAccess,
  revokeChannelSendPermission,
  roleIdsFromEnv,
  ticketOwnerRoleIds,
} from "@/lib/discord";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_DECLINE_PREFIX,
  TICKET_CLOSE_REQUEST_PREFIX,
} from "@/lib/discordInteractions";
import type { BotDeployment } from "@prisma/client";

const DISCORD_API = "https://discord.com/api/v10";

function authHeaders() {
  return { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
}

export const TICKET_CATEGORY = {
  SUPPORT: "SUPPORT",
  BEWERBUNG: "BEWERBUNG",
  VERLEIH: "VERLEIH",
} as const;
export type TicketCategoryValue = (typeof TICKET_CATEGORY)[keyof typeof TICKET_CATEGORY];

export const TICKET_STATUS = { OPEN: "OPEN", CLAIMED: "CLAIMED", CLOSED: "CLOSED" } as const;

/** Anzeigename samt Emoji je Ticket-Art - einheitlich in Panel, Thread und Claim-Kanal. */
export function ticketLabel(category: string): string {
  if (category === TICKET_CATEGORY.VERLEIH) return "📦 Verleih-Service";
  if (category === TICKET_CATEGORY.BEWERBUNG) return "📝 Bewerbung";
  return "🎫 Support";
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

  const prefix =
    ticket.category === TICKET_CATEGORY.VERLEIH
      ? "verleih"
      : ticket.category === TICKET_CATEGORY.BEWERBUNG
        ? "bewerbung"
        : "support";
  const channelName = `${prefix}-${ticket.id.slice(-6)}`;

  // Tickets laufen als private Threads im Ticket-Panel-Kanal. Nur wenn das
  // scheitert (fehlende Rechte o.ae.), faellt es auf einen eigenen Kanal in
  // der Ticket-Kategorie zurueck - beides liefert eine Kanal-ID, unter der
  // sich Nachrichten posten lassen, der Rest des Codes bleibt gleich.
  let channelId: string | null = null;

  const threadParentId =
    TICKET_PANEL_CHANNEL_ID || deployment.ticketPanelChannelId || deployment.channelId;
  if (threadParentId) {
    const thread = await createTicketThread(threadParentId, channelName, ticket.applicantDiscordId);
    if (thread.ok) channelId = thread.threadId;
  }

  if (!channelId) {
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

    const result = await createTicketChannel(deployment.guildId, categoryId, channelName, ticket.applicantDiscordId);
    if (!result.ok) return;
    channelId = result.channelId;
  }

  await prisma.ticket.update({ where: { id: ticket.id }, data: { discordChannelId: channelId } });

  const embed = {
    title: `${ticketLabel(ticket.category)} — ${ticket.subject}`,
    description:
      (initialMessage ? `${initialMessage}\n\n` : "") +
      `<@${ticket.applicantDiscordId}>, danke für dein Ticket! Ein Teammitglied übernimmt es gleich.`,
    color: ticket.category === TICKET_CATEGORY.VERLEIH ? 0xf2b544 : 0x3ddc97,
    footer: { text: `Ticket ${ticket.id.slice(-6)}` },
  };

  // Owner werden bei JEDEM neuen Ticket direkt mit angepingt.
  const ownerRoles = ticketOwnerRoleIds();
  const ownerPing = ownerRoles.map((r) => `<@&${r}>`).join(" ");

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      content: `<@${ticket.applicantDiscordId}> ${ownerPing}`.trim(),
      embeds: [embed],
      allowed_mentions: { users: [ticket.applicantDiscordId], roles: ownerRoles },
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: "🔒 Schließanfrage senden",
              custom_id: `${TICKET_CLOSE_REQUEST_PREFIX}${ticket.id}`,
            },
          ],
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
  let queueChannelId = TICKET_CLAIM_CHANNEL_ID || deployment.ticketQueueChannelId;
  if (!queueChannelId) {
    const created = await ensureTicketQueueChannel(deployment.guildId, [TICKET_CLAIM_ROLE_ID]);
    if (!created.ok) return;
    queueChannelId = created.channelId;
    await prisma.botDeployment.update({ where: { id: deployment.id }, data: { ticketQueueChannelId: queueChannelId } });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  const threadLink = ticket?.discordChannelId ? `\n<#${ticket.discordChannelId}>` : "";

  const res = await fetch(`${DISCORD_API}/channels/${queueChannelId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      // Zustaendige Rolle UND Owner werden hier bewusst angepingt - das ist
      // der Arbeitskanal des Teams, hier soll die Meldung auffallen.
      content: [TICKET_CLAIM_ROLE_ID, ...ticketOwnerRoleIds()]
        .map((r) => `<@&${r}>`)
        .join(" "),
      embeds: [
        {
          title: `${ticketLabel(category)} — neues Ticket`,
          description: `**${subject}**\nVon <@${ticket?.applicantDiscordId ?? "?"}>${threadLink}`,
          color: category === TICKET_CATEGORY.VERLEIH ? 0xf2b544 : 0x3ddc97,
          footer: { text: "Noch nicht übernommen" },
        },
      ],
      allowed_mentions: { roles: [TICKET_CLAIM_ROLE_ID, ...ticketOwnerRoleIds()] },
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "🙋 Ticket claimen", custom_id: `${TICKET_CLAIM_PREFIX}${ticketId}` },
          ],
        },
      ],
    }),
  }).catch(() => null);
  if (!res || !res.ok) return;

  const message = (await res.json()) as { id: string };
  await prisma.ticket.update({ where: { id: ticketId }, data: { queueMessageId: message.id } }).catch(() => {});
}

export type TicketActionResult = { ok: true } | { ok: false; error: string };

/**
 * Prueft, ob eine Person ein Ticket claimen/bearbeiten darf: die
 * konfigurierte Claim-Rolle (fuer Support UND Verleih dieselbe) oder eine der
 * Owner-Rollen, die immer alles duerfen. Zusaetzlich gelten weiterhin die im
 * Deployment hinterlegten Rollen und die DISCORD_ROLE_OWNER-Rollen, damit
 * bestehende Einrichtungen nicht ploetzlich ausgesperrt sind.
 */
export function canManageTicket(
  _category: TicketCategoryValue,
  deployment: Pick<BotDeployment, "supportClaimRoleIds" | "bewerbungClaimRoleIds"> | null,
  memberRoles: string[]
): boolean {
  if (canClaimTicket(memberRoles)) return true;

  const ownerIds = roleIdsFromEnv("DISCORD_ROLE_OWNER");
  if (memberRoles.some((r) => ownerIds.includes(r))) return true;

  const legacy = [deployment?.supportClaimRoleIds, deployment?.bewerbungClaimRoleIds]
    .flatMap((raw) => (raw ?? "").split(",").map((s) => s.trim()))
    .filter(Boolean);
  return memberRoles.some((r) => legacy.includes(r));
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

  const claimerLabel = actor?.displayName ?? "jemandem";

  if (ticket.discordChannelId && actor) {
    // Bei einem Thread greift die Kanal-Berechtigung nicht - dort muss die
    // Person als Thread-Mitglied aufgenommen werden. Beides versuchen, je
    // nachdem ob das Ticket als Thread oder als eigener Kanal laeuft.
    await addThreadMember(ticket.discordChannelId, actor.discordId).catch(() => {});
    await grantChannelMemberAccess(ticket.discordChannelId, actor.discordId).catch(() => {});

    // Sichtbare Bestaetigung im Ticket selbst, damit der Ersteller weiss,
    // wer sich kuemmert.
    await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content: `✅ **${claimerLabel}** hat das Ticket übernommen.`,
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
  }

  if (ticket.queueMessageId) {
    const deployment = ticket.discordGuildId
      ? await prisma.botDeployment.findUnique({ where: { guildId: ticket.discordGuildId } })
      : null;
    const queueChannelId = TICKET_CLAIM_CHANNEL_ID || deployment?.ticketQueueChannelId;
    if (queueChannelId) {
      // Button entfernen -> kein Doppel-Claim moeglich.
      await fetch(`${DISCORD_API}/channels/${queueChannelId}/messages/${ticket.queueMessageId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          content: "",
          embeds: [
            {
              title: `${ticketLabel(ticket.category)} — übernommen`,
              description:
                `**${ticket.subject}**\nVon <@${ticket.applicantDiscordId}>` +
                (ticket.discordChannelId ? `\n<#${ticket.discordChannelId}>` : ""),
              color: 0x5b8cff,
              footer: { text: `✅ Übernommen von ${claimerLabel}` },
            },
          ],
          allowed_mentions: { parse: [] },
          components: [],
        }),
      }).catch(() => {});
    }
  }

  await logAction({ actorId, action: "TICKET_CLAIMED", details: `Ticket "${ticket.subject}" übernommen.` });
  return { ok: true };
}

/**
 * Der Bearbeiter (oder ein Owner) bittet um Schliessung: der Ersteller
 * bekommt im Thread zwei Buttons zum Bestaetigen oder Ablehnen. Erst seine
 * Bestaetigung schliesst das Ticket wirklich (siehe confirmTicketCloseCore) -
 * Owner koennen mit closeTicketCore weiterhin direkt schliessen.
 */
export async function requestTicketCloseCore(
  ticketId: string,
  actorId: string
): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { closeRequestedById: actorId, closeRequestedAt: new Date() },
  });

  if (ticket.discordChannelId) {
    await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content: `<@${ticket.applicantDiscordId}>`,
        embeds: [
          {
            title: "🔒 Schließanfrage",
            description:
              "Das Team möchte dieses Ticket schließen. Ist dein Anliegen erledigt?\n\n" +
              "Bestätige unten oder lehne ab, falls noch etwas offen ist.",
            color: 0xf2b544,
          },
        ],
        allowed_mentions: { users: [ticket.applicantDiscordId] },
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "✅ Ja, schließen",
                custom_id: `${TICKET_CLOSE_CONFIRM_PREFIX}${ticketId}`,
              },
              {
                type: 2,
                style: 2,
                label: "↩️ Noch offen",
                custom_id: `${TICKET_CLOSE_DECLINE_PREFIX}${ticketId}`,
              },
            ],
          },
        ],
      }),
    }).catch(() => {});
  }

  await logAction({
    actorId,
    action: "TICKET_CLOSE_REQUESTED",
    details: `Schließanfrage für Ticket "${ticket.subject}" gestellt.`,
  });
  return { ok: true };
}

/** Frist, nach der eine unbeantwortete Schliessanfrage automatisch greift. */
export const CLOSE_REQUEST_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Schliesst Tickets, deren Schliessanfrage seit 24 Stunden unbeantwortet ist.
 * Laeuft per Cron - ohne das blieben Tickets ewig offen, nur weil der
 * Ersteller nicht mehr reagiert. Wer ablehnt, setzt die Anfrage zurueck
 * (declineTicketCloseCore) und ist damit von der Automatik ausgenommen.
 */
export async function autoCloseExpiredCloseRequests(): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - CLOSE_REQUEST_TIMEOUT_MS);

  const due = await prisma.ticket.findMany({
    where: {
      status: { not: TICKET_STATUS.CLOSED },
      closeRequestedAt: { not: null, lte: cutoff },
    },
    select: { id: true, closeRequestedById: true, discordChannelId: true },
  });

  let closed = 0;
  for (const ticket of due) {
    if (ticket.discordChannelId) {
      await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          content: "⏳ Keine Rückmeldung innerhalb von 24 Stunden — das Ticket wird jetzt automatisch geschlossen.",
          allowed_mentions: { parse: [] },
        }),
      }).catch(() => {});
    }

    const result = await closeTicketCore(ticket.id, ticket.closeRequestedById ?? null);
    if (result.ok) closed += 1;
  }

  return { closed };
}

/** Der Ersteller lehnt die Schliessung ab - das Ticket bleibt offen. */
export async function declineTicketCloseCore(ticketId: string): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { closeRequestedById: null, closeRequestedAt: null },
  });

  if (ticket.discordChannelId) {
    await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content: "↩️ Der Ersteller hat die Schließung abgelehnt — das Ticket bleibt offen.",
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
  }

  await logAction({
    action: "TICKET_CLOSE_DECLINED",
    details: `Schließung von Ticket "${ticket.subject}" vom Ersteller abgelehnt.`,
  });
  return { ok: true };
}

export async function closeTicketCore(
  ticketId: string,
  /** null bei automatischer Schliessung nach Fristablauf (kein Mensch beteiligt). */
  actorId: string | null
): Promise<TicketActionResult> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) return { ok: false, error: "Ticket ist bereits geschlossen." };

  // Verlauf sichern BEVOR der Thread archiviert/gesperrt wird - danach ist er
  // ueber die API zwar noch lesbar, kann aber jederzeit geloescht werden.
  const transcript = ticket.discordChannelId
    ? await fetchChannelTranscript(ticket.discordChannelId).catch(() => null)
    : null;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: TICKET_STATUS.CLOSED,
      closedById: actorId,
      closedAt: new Date(),
      ...(transcript ? { transcript } : {}),
    },
  });

  if (ticket.discordChannelId) {
    // Abschluss-Hinweis noch VOR dem Archivieren posten, danach nimmt Discord
    // keine Nachrichten mehr an.
    await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        embeds: [
          {
            title: "🔒 Ticket geschlossen",
            description: "Danke dir! Bei neuen Fragen einfach ein neues Ticket öffnen.",
            color: 0x6b7280,
          },
        ],
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});

    await revokeChannelSendPermission(ticket.discordChannelId, ticket.applicantDiscordId).catch(() => {});
    await archiveThread(ticket.discordChannelId).catch(() => {});
  }

  if (ticket.queueMessageId) {
    const deployment = ticket.discordGuildId
      ? await prisma.botDeployment.findUnique({ where: { guildId: ticket.discordGuildId } })
      : null;
    const queueChannelId = TICKET_CLAIM_CHANNEL_ID || deployment?.ticketQueueChannelId;
    if (queueChannelId) {
      await fetch(`${DISCORD_API}/channels/${queueChannelId}/messages/${ticket.queueMessageId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          content: "",
          embeds: [
            {
              title: `${ticketLabel(ticket.category)} — geschlossen`,
              description: `**${ticket.subject}**\nVon <@${ticket.applicantDiscordId}>`,
              color: 0x6b7280,
              footer: { text: "🔒 Erledigt" },
            },
          ],
          allowed_mentions: { parse: [] },
          components: [],
        }),
      }).catch(() => {});
    }
  }

  await logAction({ actorId, action: "TICKET_CLOSED", details: `Ticket "${ticket.subject}" geschlossen.` });
  return { ok: true };
}
