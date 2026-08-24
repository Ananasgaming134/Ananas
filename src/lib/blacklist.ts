import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { BLACKLIST_CHANNEL_ID, DISCORD_BOT_TOKEN, sendDiscordDirectMessage } from "@/lib/discord";
import { SITE_NAME } from "@/lib/constants";

const DISCORD_API = "https://discord.com/api/v10";

export type BlacklistResult = { ok: true } | { ok: false; error: string };

/**
 * Prueft, ob jemand auf der roten Liste steht. Abgelaufene befristete
 * Sperren zaehlen NICHT mehr - sie werden vom Cron ohnehin entfernt, aber
 * die Pruefung hier ist die verlaessliche Quelle.
 */
export async function isBlacklisted(discordId: string): Promise<boolean> {
  const entry = await prisma.applicationBlock.findUnique({ where: { discordId } });
  if (!entry) return false;
  if (entry.expiresAt && entry.expiresAt <= new Date()) return false;
  return true;
}

export type AddBlacklistInput = {
  discordId: string;
  username?: string | null;
  displayName?: string | null;
  minecraftName?: string | null;
  minecraftUuid?: string | null;
  reason: string;
  /** null = dauerhaft, sonst Ablaufzeitpunkt der Sperre. */
  expiresAt?: Date | null;
  actorId?: string | null;
  /** Bei Import aus dem Discord-Kanal: keine DM, keine neue Kanal-Nachricht. */
  silent?: boolean;
};

/**
 * Traegt jemanden auf der roten Liste ein: keine Bewerbung, kein
 * Verleih-Ticket mehr moeglich. Dokumentiert den Eintrag im Blacklist-Kanal
 * und benachrichtigt die Person per DM - bei befristeten Sperren inklusive
 * Enddatum.
 */
export async function addToBlacklistCore(input: AddBlacklistInput): Promise<BlacklistResult> {
  if (!input.discordId.trim()) return { ok: false, error: "Discord-ID fehlt." };
  if (!input.reason.trim()) return { ok: false, error: "Bitte einen Grund angeben." };

  const existing = await prisma.applicationBlock.findUnique({ where: { discordId: input.discordId } });
  if (existing && !input.silent) {
    return { ok: false, error: "Diese Person steht bereits auf der roten Liste." };
  }

  const entry = await prisma.applicationBlock.upsert({
    where: { discordId: input.discordId },
    update: {
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
      minecraftName: input.minecraftName ?? existing?.minecraftName ?? null,
      minecraftUuid: input.minecraftUuid ?? existing?.minecraftUuid ?? null,
      username: input.username ?? existing?.username ?? null,
      displayName: input.displayName ?? existing?.displayName ?? null,
      expiryDmSentAt: null,
    },
    create: {
      discordId: input.discordId,
      username: input.username ?? null,
      displayName: input.displayName ?? null,
      minecraftName: input.minecraftName ?? null,
      minecraftUuid: input.minecraftUuid ?? null,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
      blockedById: input.actorId ?? null,
    },
  });

  if (!input.silent) {
    await postBlacklistEntry(entry.id).catch(() => {});
    await notifyBlacklisted(input.discordId, input.reason, input.expiresAt ?? null).catch(() => {});

    await logAction({
      actorId: input.actorId ?? null,
      action: "BLACKLIST_ADDED",
      details: input.expiresAt
        ? `${input.minecraftName ?? input.discordId} befristet gesperrt bis ${input.expiresAt.toLocaleDateString("de-DE")}: ${input.reason}`
        : `${input.minecraftName ?? input.discordId} dauerhaft auf die rote Liste gesetzt: ${input.reason}`,
    });
  }

  return { ok: true };
}

/** Entfernt jemanden von der roten Liste - danach sind Bewerbung und Tickets wieder moeglich. */
export async function removeFromBlacklistCore(
  discordId: string,
  actorId: string | null,
  notify = true
): Promise<BlacklistResult> {
  const entry = await prisma.applicationBlock.findUnique({ where: { discordId } });
  if (!entry) return { ok: false, error: "Kein Eintrag gefunden." };

  await prisma.applicationBlock.delete({ where: { discordId } });

  if (entry.discordMessageId && BLACKLIST_CHANNEL_ID && DISCORD_BOT_TOKEN) {
    await fetch(`${DISCORD_API}/channels/${BLACKLIST_CHANNEL_ID}/messages/${entry.discordMessageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "✅ Von der roten Liste entfernt",
            description: `<@${discordId}>${entry.minecraftName ? ` · ${entry.minecraftName}` : ""}`,
            color: 0x3ddc97,
            fields: [{ name: "Ursprünglicher Grund", value: entry.reason.slice(0, 1000) }],
          },
        ],
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
  }

  if (notify) {
    await sendDiscordDirectMessage(discordId, {
      embeds: [
        {
          title: "✅ Sperre aufgehoben",
          description:
            `Du stehst nicht mehr auf der roten Liste des ${SITE_NAME}.\n\n` +
            "Du kannst dich ab sofort wieder bewerben und Tickets eröffnen.",
          color: 0x3ddc97,
        },
      ],
    }).catch(() => {});
  }

  await logAction({
    actorId,
    action: "BLACKLIST_REMOVED",
    details: `${entry.minecraftName ?? discordId} von der roten Liste entfernt.`,
  });

  return { ok: true };
}

/** DM beim Eintragen - mit Dauer, falls die Sperre befristet ist. */
async function notifyBlacklisted(
  discordId: string,
  reason: string,
  expiresAt: Date | null
): Promise<void> {
  const lines = [`Du wurdest im ${SITE_NAME} gesperrt.`, "", `**Grund:** ${reason}`, ""];

  if (expiresAt) {
    const unix = Math.floor(expiresAt.getTime() / 1000);
    lines.push(`**Die Sperre endet** <t:${unix}:F> (<t:${unix}:R>).`);
    lines.push("Danach kannst du dich automatisch wieder bewerben.");
  } else {
    lines.push("**Die Sperre ist dauerhaft.**");
    lines.push("Bewerbungen und Verleih-Tickets sind damit nicht mehr möglich.");
  }

  await sendDiscordDirectMessage(discordId, {
    embeds: [{ title: "🚫 Sperre", description: lines.join("\n"), color: 0xf2545b }],
  });
}

/** Dokumentiert einen Eintrag im Blacklist-Kanal und merkt sich die Nachricht. */
async function postBlacklistEntry(entryId: string): Promise<void> {
  if (!DISCORD_BOT_TOKEN || !BLACKLIST_CHANNEL_ID) return;
  const entry = await prisma.applicationBlock.findUnique({ where: { id: entryId } });
  if (!entry) return;

  const fields = [
    { name: "Discord User", value: `<@${entry.discordId}> (${entry.discordId})` },
    { name: "Minecraft Name", value: entry.minecraftName || "—" },
    { name: "UUID", value: entry.minecraftUuid || "—" },
    { name: "Grund", value: entry.reason.slice(0, 1000) },
    {
      name: "Dauer",
      value: entry.expiresAt
        ? `befristet bis <t:${Math.floor(entry.expiresAt.getTime() / 1000)}:F>`
        : "dauerhaft",
    },
  ];

  const res = await fetch(`${DISCORD_API}/channels/${BLACKLIST_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title: "🚫 User zur Blacklist hinzugefügt", color: 0xf2545b, fields }],
      allowed_mentions: { parse: [] },
    }),
  }).catch(() => null);

  if (!res || !res.ok) return;
  const message = (await res.json()) as { id: string };
  await prisma.applicationBlock
    .update({ where: { id: entryId }, data: { discordMessageId: message.id } })
    .catch(() => {});
}

/**
 * Laeuft per Cron: hebt abgelaufene befristete Sperren auf und schickt der
 * Person eine DM, dass sie wieder aufnahmefaehig ist.
 */
export async function expireBlacklistEntries(): Promise<{ expired: number }> {
  const now = new Date();
  const due = await prisma.applicationBlock.findMany({
    where: { expiresAt: { not: null, lte: now } },
  });

  let expired = 0;
  for (const entry of due) {
    await sendDiscordDirectMessage(entry.discordId, {
      embeds: [
        {
          title: "✅ Deine Sperre ist abgelaufen",
          description:
            `Die befristete Sperre im ${SITE_NAME} ist beendet.\n\n` +
            "Du kannst dich ab sofort wieder bewerben und Tickets eröffnen.",
          color: 0x3ddc97,
        },
      ],
    }).catch(() => {});

    await removeFromBlacklistCore(entry.discordId, null, false);
    expired += 1;
  }

  return { expired };
}

type ImportedEntry = {
  discordId: string;
  minecraftName?: string;
  minecraftUuid?: string;
  reason: string;
  messageId: string;
};

/**
 * Liest die bestehenden Blacklist-Eintraege aus dem Discord-Kanal ein (die
 * vom alten Bot geposteten Embeds mit den Feldern "Discord User",
 * "Minecraft Name", "UUID", "Grund") und uebernimmt sie in die Datenbank.
 * Bereits vorhandene Eintraege bleiben unangetastet.
 */
export async function importBlacklistFromChannel(): Promise<{
  found: number;
  imported: number;
  skipped: number;
}> {
  if (!DISCORD_BOT_TOKEN || !BLACKLIST_CHANNEL_ID) return { found: 0, imported: 0, skipped: 0 };

  const entries: ImportedEntry[] = [];
  let before: string | undefined;

  // Kanal komplett durchblaettern (100 Nachrichten pro Abruf).
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${DISCORD_API}/channels/${BLACKLIST_CHANNEL_ID}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
    if (!res.ok) break;
    const messages = (await res.json()) as Array<{
      id: string;
      embeds?: Array<{ title?: string; fields?: Array<{ name: string; value: string }> }>;
    }>;
    if (messages.length === 0) break;

    for (const message of messages) {
      for (const embed of message.embeds ?? []) {
        if (!embed.title?.includes("Blacklist")) continue;
        const field = (name: string) =>
          embed.fields?.find((f) => f.name.toLowerCase().includes(name))?.value?.trim();

        const rawUser = field("discord");
        const discordId = rawUser?.match(/\d{15,}/)?.[0];
        const reason = field("grund");
        if (!discordId || !reason) continue;

        entries.push({
          discordId,
          minecraftName: field("minecraft") || undefined,
          minecraftUuid: field("uuid") || undefined,
          reason,
          messageId: message.id,
        });
      }
    }

    before = messages[messages.length - 1].id;
    if (messages.length < 100) break;
  }

  let imported = 0;
  let skipped = 0;
  for (const entry of entries) {
    const existing = await prisma.applicationBlock.findUnique({ where: { discordId: entry.discordId } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.applicationBlock.create({
      data: {
        discordId: entry.discordId,
        minecraftName: entry.minecraftName ?? null,
        minecraftUuid: entry.minecraftUuid ?? null,
        reason: entry.reason,
        discordMessageId: entry.messageId,
        expiresAt: null,
      },
    });
    imported += 1;
  }

  if (imported > 0) {
    await logAction({
      action: "BLACKLIST_IMPORTED",
      details: `${imported} Einträge aus dem Blacklist-Kanal übernommen (${skipped} bereits vorhanden).`,
    });
  }

  return { found: entries.length, imported, skipped };
}
