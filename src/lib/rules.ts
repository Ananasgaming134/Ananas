import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { DISCORD_BOT_TOKEN, RULES_CHANNEL_ID } from "@/lib/discord";

const DISCORD_API = "https://discord.com/api/v10";
/** Discord erlaubt 2000 Zeichen pro Nachricht - das Regelwerk wird deshalb aufgeteilt. */
const MAX_MESSAGE_CHARS = 1900;

/**
 * Das Regelwerk liegt als EIN Datensatz in der Datenbank (key "default"),
 * wird auf der Website angezeigt und dort von Ownern bearbeitet. Beim
 * Speichern wird es in den Discord-Regelwerk-Kanal gespiegelt - dabei werden
 * immer DIESELBEN Nachrichten aktualisiert statt neue zu posten.
 *
 * Mehrere Message-IDs, weil Discord bei 2000 Zeichen abschneidet: der Text
 * wird an Absaetzen in Bloecke geteilt, die IDs kommagetrennt gespeichert.
 */
export async function getRuleSet() {
  return prisma.ruleSet.findUnique({ where: { key: "default" } });
}

/** Teilt den Text an Absaetzen in Discord-taugliche Bloecke. */
function splitIntoChunks(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    // Einzelner Absatz zu lang -> hart an Zeilen weiterteilen.
    if (paragraph.length > MAX_MESSAGE_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      let rest = paragraph;
      while (rest.length > MAX_MESSAGE_CHARS) {
        const cut = rest.lastIndexOf("\n", MAX_MESSAGE_CHARS);
        const at = cut > 0 ? cut : MAX_MESSAGE_CHARS;
        chunks.push(rest.slice(0, at));
        rest = rest.slice(at).replace(/^\n/, "");
      }
      current = rest;
      continue;
    }

    if (current.length + paragraph.length + 2 > MAX_MESSAGE_CHARS) {
      chunks.push(current);
      current = paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : ["(noch kein Regelwerk hinterlegt)"];
}

export type RulesResult = { ok: true; messageIds: string[] } | { ok: false; error: string };

/**
 * Spiegelt das Regelwerk in den Discord-Kanal. Vorhandene Nachrichten werden
 * bearbeitet; wird der Text kuerzer, werden ueberzaehlige Nachrichten
 * geloescht, wird er laenger, kommen neue dazu.
 */
export async function syncRulesToDiscord(content: string): Promise<RulesResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };
  if (!RULES_CHANNEL_ID) return { ok: false, error: "Kein Regelwerk-Kanal konfiguriert." };

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
  };

  const existing = await getRuleSet();
  const oldIds = (existing?.discordMessageId ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const chunks = splitIntoChunks(content);
  const newIds: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const body = JSON.stringify({ content: chunks[i], allowed_mentions: { parse: [] } });
    const oldId = oldIds[i];

    if (oldId) {
      const res = await fetch(`${DISCORD_API}/channels/${RULES_CHANNEL_ID}/messages/${oldId}`, {
        method: "PATCH",
        headers,
        body,
      });
      if (res.ok) {
        newIds.push(oldId);
        continue;
      }
      // Nachricht wurde geloescht -> unten neu posten.
    }

    const res = await fetch(`${DISCORD_API}/channels/${RULES_CHANNEL_ID}/messages`, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Discord antwortete mit ${res.status}: ${text.slice(0, 200)}` };
    }
    const message = (await res.json()) as { id: string };
    newIds.push(message.id);
  }

  // Ueberzaehlige alte Nachrichten entfernen (Text ist kuerzer geworden).
  for (const stale of oldIds.slice(chunks.length)) {
    await fetch(`${DISCORD_API}/channels/${RULES_CHANNEL_ID}/messages/${stale}`, {
      method: "DELETE",
      headers,
    }).catch(() => {});
  }

  return { ok: true, messageIds: newIds };
}

/**
 * Speichert das Regelwerk und spiegelt es sofort nach Discord. Der
 * Datenbank-Stand ist die Wahrheit - schlaegt Discord fehl, ist der Text
 * trotzdem gespeichert und auf der Website sichtbar.
 */
export async function saveRuleSetCore(
  content: string,
  actorId: string
): Promise<{ ok: true; discordOk: boolean; discordError?: string } | { ok: false; error: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Das Regelwerk darf nicht leer sein." };

  const sync = await syncRulesToDiscord(trimmed);

  await prisma.ruleSet.upsert({
    where: { key: "default" },
    update: {
      content: trimmed,
      updatedById: actorId,
      ...(sync.ok ? { discordMessageId: sync.messageIds.join(",") } : {}),
    },
    create: {
      key: "default",
      content: trimmed,
      updatedById: actorId,
      discordMessageId: sync.ok ? sync.messageIds.join(",") : null,
    },
  });

  await logAction({
    actorId,
    action: "RULES_UPDATED",
    details: sync.ok
      ? "Regelwerk gespeichert und in Discord aktualisiert."
      : `Regelwerk gespeichert, Discord-Aktualisierung fehlgeschlagen: ${sync.error}`,
  });

  return sync.ok
    ? { ok: true, discordOk: true }
    : { ok: true, discordOk: false, discordError: sync.error };
}
