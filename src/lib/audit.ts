import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN, DISCORD_LOG_CHANNEL_ID } from "@/lib/discord";

type LogParams = {
  actorId?: string | null;
  targetId?: string | null;
  action: string;
  details?: string | null;
};

export async function logAction(params: LogParams) {
  const entry = await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      targetId: params.targetId ?? null,
      action: params.action,
      details: params.details ?? null,
    },
  });

  // Nie die eigentliche Aktion scheitern lassen, nur weil die
  // Discord-Spiegelung fehlschlaegt (z.B. Kanal geloescht, Bot kein Zugriff).
  mirrorToDiscord(params).catch(() => {});

  return entry;
}

/**
 * Spiegelt wirklich jede geloggte Aktion im System zusaetzlich als Nachricht
 * in den Discord-Log-Kanal - unabhaengig von der lokalen Audit-Log-Ansicht
 * auf der Website, damit Owner/Aufsicht auch unterwegs jede Veraenderung
 * sehen. Zentral hier verdrahtet, weil ALLE logAction()-Aufrufe im ganzen
 * Projekt durch diese eine Funktion laufen.
 */
async function mirrorToDiscord(params: LogParams) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_LOG_CHANNEL_ID) return;

  const ids = [params.actorId, params.targetId].filter((id): id is string => Boolean(id));
  const members = ids.length > 0 ? await prisma.member.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(members.map((m) => [m.id, m]));

  const actor = params.actorId ? byId.get(params.actorId) : null;
  const target = params.targetId ? byId.get(params.targetId) : null;

  const lines = [`**${params.action}**`, `Von: ${actor ? `${actor.displayName} (@${actor.username})` : "System"}`];
  if (target && target.id !== actor?.id) {
    lines.push(`Betrifft: ${target.displayName} (@${target.username})`);
  }
  if (params.details) lines.push(params.details);

  await fetch(`https://discord.com/api/v10/channels/${DISCORD_LOG_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [{ description: lines.join("\n"), color: 0x5865f2, timestamp: new Date().toISOString() }],
    }),
  });
}
