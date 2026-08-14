import { Client, GatewayIntentBits, type GuildMember, type PartialGuildMember } from "discord.js";
import { WORTKETTEN_CHANNEL_ID } from "@/lib/constants";
import { processWordChainAttempt } from "@/lib/wordChain";
import { roleIdsFromEnv } from "@/lib/discord";
import { ensureMemberFromDiscordUser } from "@/lib/discordInteractions";

const globalForGateway = globalThis as unknown as { discordGatewayClient?: Client };

const CHECK = "✅";
const CROSS = "❌";

async function handleMessage(message: {
  author: { id: string; bot: boolean; send: (payload: { content: string }) => Promise<unknown> };
  channelId: string;
  content: string;
  react: (emoji: string) => Promise<unknown>;
}) {
  if (message.author.bot) return;
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
 * Sobald jemand die konfigurierte Kunde-Rolle neu bekommt, wird sofort ein
 * Member-Datensatz angelegt (idempotent - ensureMemberFromDiscordUser legt
 * nur an, falls noch keiner existiert, z.B. weil die Bewerbung schon einen
 * angelegt hat). Deckt den Fall ab, dass die Rolle manuell in Discord
 * vergeben wird, ohne den Bewerbungsprozess zu durchlaufen.
 */
async function handleMemberRoleUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  if (kundeRoleIds.length === 0) return;

  const hadRole = oldMember.roles?.cache.some((r) => kundeRoleIds.includes(r.id)) ?? false;
  const hasRole = newMember.roles.cache.some((r) => kundeRoleIds.includes(r.id));
  if (hadRole || !hasRole) return;

  try {
    await ensureMemberFromDiscordUser({
      id: newMember.user.id,
      username: newMember.user.username,
      global_name: newMember.user.globalName,
      avatar: newMember.user.avatar,
    });
    console.log(`[gateway] Member fuer ${newMember.user.username} (${newMember.user.id}) per Rollenvergabe sichergestellt.`);
  } catch (err) {
    console.error("[gateway] Konnte Member bei Rollenvergabe nicht anlegen:", err);
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

  if (WORTKETTEN_CHANNEL_ID) {
    client.on("messageCreate", (message) => {
      void handleMessage(message);
    });
  } else {
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
