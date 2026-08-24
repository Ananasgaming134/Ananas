import { Client, GatewayIntentBits, type GuildMember, type PartialGuildMember } from "discord.js";
import { WORTKETTEN_CHANNEL_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { processWordChainAttempt } from "@/lib/wordChain";
import { roleIdsFromEnv } from "@/lib/discord";
import {
  revokeAccessAndRole,
  startGracePeriodIfNeeded,
  syncMemberRoleFromDiscord,
} from "@/lib/accessControl";
import { ensureMemberFromDiscordUser } from "@/lib/discordInteractions";

const globalForGateway = globalThis as unknown as { discordGatewayClient?: Client };

const CHECK = "✅";
const CROSS = "❌";

/**
 * Haelt offene Ticket-Threads wach: schreibt jemand in einen Thread, der
 * bereits archiviert wurde, wird er sofort wieder geoeffnet und die
 * Auto-Archiv-Zeit aufs Maximum gesetzt. Geschlossene Tickets bleiben
 * archiviert - die sollen ja einschlafen.
 */
async function keepTicketThreadAlive(channelId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { discordChannelId: channelId, status: { not: "CLOSED" } },
    select: { id: true },
  });
  if (!ticket) return;

  await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ archived: false, auto_archive_duration: 10080 }),
  }).catch(() => {});
}

async function handleMessage(message: {
  author: { id: string; bot: boolean; send: (payload: { content: string }) => Promise<unknown> };
  channelId: string;
  content: string;
  react: (emoji: string) => Promise<unknown>;
}) {
  if (message.author.bot) return;

  void keepTicketThreadAlive(message.channelId).catch(() => {});

  if (!WORTKETTEN_CHANNEL_ID || message.channelId !== WORTKETTEN_CHANNEL_ID) return;

  try {
    const result = await processWordChainAttempt(message.channelId, message.author.id, message.content);
    if (result.kind === "ignored") return;

    if (result.kind === "accepted") {
      await message.react(CHECK).catch((err) => console.error("[wortkette] Reaktion (✅) fehlgeschlagen:", err));
      return;
    }

    await message.react(CROSS).catch((err) => console.error("[wortkette] Reaktion (❌) fehlgeschlagen:", err));
    await message.author
      .send({ content: `❌ Dein Wort „${result.word}“ im Wortkettenspiel wurde nicht akzeptiert:\n${result.reason}` })
      .catch((err) => console.error("[wortkette] DM konnte nicht gesendet werden:", err));
  } catch (err) {
    console.error("[wortkette] Verarbeitung fehlgeschlagen:", err);
  }
}

/**
 * Reagiert sofort auf Rollenaenderungen in Discord - beide Richtungen:
 *
 * - Rolle NEU vergeben: Member-Datensatz sicherstellen (idempotent) und die
 *   3-Stunden-Zahlungsfrist starten, falls noch kein Abo laeuft.
 * - Rolle ENTZOGEN: Zugang sofort sperren, ohne auf den naechsten Cron-Lauf
 *   oder die Client-Pruefung zu warten.
 *
 * Staff-Rollen (Owner/Aufsicht) zaehlen ebenfalls als Zugang - wer die noch
 * hat, verliert beim Entzug der Kunde-Rolle nichts.
 */
async function handleMemberRoleUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  const ownerRoleIds = roleIdsFromEnv("DISCORD_ROLE_OWNER");
  const aufsichtRoleIds = roleIdsFromEnv("DISCORD_ROLE_AUFSICHT");
  const relevant = [...kundeRoleIds, ...ownerRoleIds, ...aufsichtRoleIds];
  if (relevant.length === 0) return;

  const before = oldMember.roles?.cache.map((r) => r.id) ?? [];
  const after = newMember.roles.cache.map((r) => r.id);

  // Nur reagieren, wenn sich an den LeihCenter-Rollen wirklich etwas geaendert
  // hat - andere Rollen (VIP, Farben, ...) sind fuer uns belanglos.
  const relevantBefore = before.filter((r) => relevant.includes(r)).sort().join(",");
  const relevantAfter = after.filter((r) => relevant.includes(r)).sort().join(",");
  if (relevantBefore === relevantAfter) return;

  const hadKunde = before.some((r) => kundeRoleIds.includes(r));
  const hasKunde = after.some((r) => kundeRoleIds.includes(r));
  const hasAny = relevantAfter.length > 0;

  try {
    // Kunde-Rolle NEU: Datensatz sicherstellen und Zahlungsfrist starten.
    if (!hadKunde && hasKunde) {
      const member = await ensureMemberFromDiscordUser({
        id: newMember.user.id,
        username: newMember.user.username,
        global_name: newMember.user.globalName,
        avatar: newMember.user.avatar,
      });
      await startGracePeriodIfNeeded(member.id);
      console.log(`[gateway] Kunde-Rolle fuer ${newMember.user.username} vergeben - Zahlungsfrist laeuft.`);
      return;
    }

    const member = await prisma.member.findUnique({ where: { discordId: newMember.user.id } });
    if (!member) return;

    // Gar keine LeihCenter-Rolle mehr -> Zugang sofort sperren.
    if (!hasAny) {
      await revokeAccessAndRole(
        member,
        "Die LeihCenter-Rolle wurde auf Discord entfernt.",
        "ACCESS_REVOKED_ROLE_REMOVED"
      );
      console.log(`[gateway] Alle Rollen bei ${newMember.user.username} entfernt - Zugang gesperrt.`);
      return;
    }

    // Sonst: Stufe neu bestimmen (z.B. Owner -> Kunde nach Herabstufung).
    // syncMemberRoleFromDiscord aktualisiert den Datensatz und macht damit
    // eine noch offene Sitzung beim naechsten Klick ungueltig.
    const status = await syncMemberRoleFromDiscord(member);
    if (status === "changed") {
      console.log(`[gateway] Rolle von ${newMember.user.username} geaendert - Neuanmeldung noetig.`);
    }
  } catch (err) {
    console.error("[gateway] Rollenaenderung konnte nicht verarbeitet werden:", err);
  }
}

/**
 * Startet die dauerhafte Gateway-Verbindung (wird einmal aus
 * src/instrumentation.ts beim Serverstart aufgerufen) - urspruenglich nur
 * fuers Wortkettenspiel, jetzt zusaetzlich fuer die sofortige
 * Member-Anlage bei Kunde-Rollenvergabe. Braucht die privilegierten Intents
 * "Message Content" UND "Server Members" im Discord Developer Portal (Bot ->
 * Privileged Gateway Intents) - ohne die laesst Discord die Verbindung mit
 * disallowed-intents-Fehler nicht zu. Ein Verbindungsfehler wird nur geloggt
 * und darf die Next.js-App nicht zum Absturz bringen, da beide Features nur
 * Zusatzfunktionen sind - Ausleihe, Cron usw. muessen unabhaengig davon
 * weiterlaufen.
 */
export function startDiscordGateway() {
  if (globalForGateway.discordGatewayClient) return globalForGateway.discordGatewayClient;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[gateway] Kein DISCORD_BOT_TOKEN gesetzt - Gateway wird nicht gestartet.");
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once("ready", () => {
    console.log(`[gateway] Discord-Gateway verbunden als ${client.user?.tag}.`);
  });

  client.on("error", (err) => {
    console.error("[gateway] Gateway-Fehler:", err);
  });

  // Immer registrieren: der Handler haelt auch offene Ticket-Threads wach,
  // unabhaengig davon ob das Wortkettenspiel eingerichtet ist.
  client.on("messageCreate", (message) => {
    void handleMessage(message);
  });
  if (!WORTKETTEN_CHANNEL_ID) {
    console.warn("[wortkette] Kein DISCORD_WORTKETTEN_CHANNEL_ID gesetzt - Wortkettenspiel deaktiviert.");
  }

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    void handleMemberRoleUpdate(oldMember, newMember);
  });

  client.login(token).catch((err) => {
    console.error(
      "[gateway] Gateway-Login fehlgeschlagen (vermutlich fehlt ein privilegierter Intent im " +
        "Discord Developer Portal unter Bot -> Privileged Gateway Intents):",
      err
    );
  });

  globalForGateway.discordGatewayClient = client;
  return client;
}
