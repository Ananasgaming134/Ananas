import { Client, GatewayIntentBits } from "discord.js";
import { WORTKETTEN_CHANNEL_ID } from "@/lib/constants";
import { processWordChainAttempt } from "@/lib/wordChain";

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
 * Startet die dauerhafte Gateway-Verbindung fuer das Wortkettenspiel (wird
 * einmal aus src/instrumentation.ts beim Serverstart aufgerufen). Braucht das
 * privilegierte "Message Content Intent" im Discord Developer Portal (Bot ->
 * Privileged Gateway Intents) - ohne das laesst Discord die Verbindung mit
 * disallowed-intents-Fehler nicht zu. Ein Verbindungsfehler wird nur geloggt
 * und darf die Next.js-App nicht zum Absturz bringen, da das Wortkettenspiel
 * nur ein Zusatzfeature ist - Ausleihe, Cron usw. muessen unabhaengig davon
 * weiterlaufen.
 */
export function startDiscordGateway() {
  if (globalForGateway.discordGatewayClient) return globalForGateway.discordGatewayClient;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[wortkette] Kein DISCORD_BOT_TOKEN gesetzt - Gateway wird nicht gestartet.");
    return null;
  }
  if (!WORTKETTEN_CHANNEL_ID) {
    console.warn("[wortkette] Kein DISCORD_WORTKETTEN_CHANNEL_ID gesetzt - Gateway wird nicht gestartet.");
    return null;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once("ready", () => {
    console.log(`[wortkette] Discord-Gateway verbunden als ${client.user?.tag}.`);
  });

  client.on("error", (err) => {
    console.error("[wortkette] Gateway-Fehler:", err);
  });

  client.on("messageCreate", (message) => {
    void handleMessage(message);
  });

  client.login(token).catch((err) => {
    console.error(
      "[wortkette] Gateway-Login fehlgeschlagen (vermutlich fehlt das 'Message Content Intent' im " +
        "Discord Developer Portal unter Bot -> Privileged Gateway Intents):",
      err
    );
  });

  globalForGateway.discordGatewayClient = client;
  return client;
}
