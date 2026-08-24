import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // discord.js (Wortkettenspiel-Gateway) nutzt Node-spezifische APIs und
  // optionale native Zusatzpakete (z.B. zlib-sync), die beim Bundling
  // fehlschlagen wuerden - stattdessen per nativem require() zur Laufzeit laden.
  serverExternalPackages: ["discord.js", "@discordjs/ws"],

  experimental: {
    serverActions: {
      // Server-Aktionen nehmen standardmaessig nur 1 MB entgegen - ein
      // Banner oder Item-Bild ist schnell groesser, und die Anfrage wird
      // dann verworfen, bevor irgendein eigener Code laeuft (das Formular
      // meldet dadurch nicht einmal einen Fehler). Wir erlauben bis 5 MB
      // pro Bild plus Luft fuer die uebrigen Felder und den Overhead, den
      // multipart/form-data mitbringt.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
