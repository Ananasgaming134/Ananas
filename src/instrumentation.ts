// Laeuft einmalig beim Hochfahren des Next.js-Servers.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Der Server steht auf UTC. Ohne diese Zeile rendert jede Datums- und
  // Uhrzeitangabe, die auf dem Server erzeugt wird, in UTC - im Sommer also
  // zwei Stunden zu frueh. Fristen, Ablaufdaten und Sperren sahen dadurch
  // falsch aus. Die gespeicherten Zeitpunkte selbst sind davon nie betroffen,
  // die stehen als absolute Zeitstempel in der Datenbank; es ging immer nur
  // um die Darstellung.
  process.env.TZ = process.env.TZ || "Europe/Berlin";

  // Dauerhafte Discord-Gateway-Verbindung (Rollenaenderungen, Zahlungen,
  // Wortkettenspiel, Ticket-Threads) - siehe src/lib/discordGateway.ts.
  // discord.js braucht volle Node.js-APIs, daher per dynamischem Import.
  const { startDiscordGateway } = await import("@/lib/discordGateway");
  startDiscordGateway();
}
