// Startet einmalig beim Hochfahren des Next.js-Servers die dauerhafte
// Discord-Gateway-Verbindung fuer das Wortkettenspiel (siehe
// src/lib/discordGateway.ts). discord.js braucht volle Node.js-APIs, daher
// nur im Node-Runtime und per dynamischem Import laden (nicht im Edge-Runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscordGateway } = await import("@/lib/discordGateway");
    startDiscordGateway();
  }
}
