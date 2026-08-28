import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN } from "@/lib/discord";
import { TICKET_STATUS } from "@/lib/tickets";

const DISCORD_API = "https://discord.com/api/v10";

export type TicketMessage = {
  id: string;
  autor: string;
  avatarUrl: string | null;
  istBot: boolean;
  /** Vom LeihCenter-Bot im Auftrag einer Person geschrieben (von der Website). */
  vonWebsite: boolean;
  text: string;
  anhaenge: { url: string; name: string }[];
  zeit: Date;
};

type RohNachricht = {
  id: string;
  content: string;
  timestamp: string;
  author: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
    bot?: boolean;
  };
  attachments?: { url: string; filename: string }[];
  embeds?: { author?: { name?: string; icon_url?: string }; description?: string; title?: string }[];
  mentions?: { id: string; username: string; global_name?: string | null }[];
};

function avatarUrl(userId: string, hash: string | null): string | null {
  return hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64` : null;
}

/**
 * Erwaehnungen kommen als <@123456> an. Auf der Website liest sich das wie ein
 * Fehler, deshalb werden sie durch die Namen ersetzt, die Discord gleich
 * mitliefert. Rollen-Pings haben keinen Namen dabei - die werden zu einem
 * neutralen Platzhalter, sie sind ohnehin nur Signal ans Team.
 */
function erwaehnungenAufloesen(text: string, mentions: RohNachricht["mentions"]): string {
  let ergebnis = text.replace(/<@&\d+>/g, "@Team");
  for (const m of mentions ?? []) {
    ergebnis = ergebnis.replaceAll(`<@${m.id}>`, `@${m.global_name || m.username}`);
  }
  // Wen Discord nicht mitgeliefert hat (z.B. jemand, der den Server verlassen hat).
  return ergebnis.replace(/<@!?\d+>/g, "@jemand");
}

/**
 * Holt den Gespraechsverlauf eines Tickets direkt aus dem Discord-Thread.
 * Bewusst live statt gespiegelt: so koennen Website und Discord gar nicht
 * auseinanderlaufen, egal wo geschrieben wird.
 *
 * Nachrichten, die ueber die Website geschrieben wurden, kommen als Embed mit
 * Autorzeile an - die wird hier wieder in Name und Text zerlegt, damit sie
 * aussehen wie normale Beitraege und nicht wie Bot-Meldungen.
 */
export async function getTicketMessages(channelId: string | null): Promise<TicketMessage[]> {
  if (!channelId || !DISCORD_BOT_TOKEN) return [];

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const roh = (await res.json()) as RohNachricht[];

  return roh
    .map((m): TicketMessage => {
      const websiteEmbed = m.embeds?.find((e) => e.author?.name && e.description);

      // Ohne das ginge der Text von Embeds ohne Autorzeile verloren - genau
      // diese Form hat die Eroeffnungsnachricht eines Tickets.
      const embedTexte = websiteEmbed
        ? [websiteEmbed.description ?? ""]
        : (m.embeds ?? []).map((e) => [e.title, e.description].filter(Boolean).join("\n"));
      const roherText = [websiteEmbed ? "" : m.content, ...embedTexte]
        .filter((t) => t && t.trim())
        .join("\n\n");

      return {
        id: m.id,
        autor: websiteEmbed?.author?.name ?? (m.author.global_name || m.author.username),
        avatarUrl: websiteEmbed?.author?.icon_url ?? avatarUrl(m.author.id, m.author.avatar),
        istBot: Boolean(m.author.bot) && !websiteEmbed,
        vonWebsite: Boolean(websiteEmbed),
        text: erwaehnungenAufloesen(roherText, m.mentions),
        anhaenge: (m.attachments ?? []).map((a) => ({ url: a.url, name: a.filename })),
        zeit: new Date(m.timestamp),
      };
    })
    // Discord liefert die neuesten zuerst - gelesen wird von oben nach unten.
    .reverse()
    .filter((m) => m.text.trim() || m.anhaenge.length > 0);
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Schreibt einen Beitrag von der Website in den Discord-Thread. Gepostet wird
 * als Embed mit Name und Bild der Person, damit im Thread erkennbar bleibt,
 * wer geschrieben hat - der Bot kann nicht unter fremdem Namen posten.
 */
export async function postTicketMessage(
  ticketId: string,
  autorName: string,
  autorAvatar: string | null,
  text: string
): Promise<SendResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };
  if (ticket.status === TICKET_STATUS.CLOSED) {
    return {
      ok: false,
      error: "Das Ticket ist geschlossen - hier kann nicht mehr geschrieben werden.",
    };
  }
  if (!ticket.discordChannelId) {
    return { ok: false, error: "Zu diesem Ticket gibt es keinen Discord-Kanal." };
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Ein archivierter Thread nimmt keine Nachrichten an - erst aufwecken.
  await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: false, auto_archive_duration: 10080 }),
  }).catch(() => {});

  const res = await fetch(`${DISCORD_API}/channels/${ticket.discordChannelId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      embeds: [
        {
          author: { name: autorName, icon_url: autorAvatar ?? undefined },
          description: text,
          color: 0x5b8cff,
          footer: { text: "über die Website" },
        },
      ],
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Discord antwortete mit ${res.status}: ${body.slice(0, 160)}` };
  }

  return { ok: true };
}
