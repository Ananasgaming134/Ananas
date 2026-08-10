import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // discord.js (Wortkettenspiel-Gateway) nutzt Node-spezifische APIs und
  // optionale native Zusatzpakete (z.B. zlib-sync), die beim Bundling
  // fehlschlagen wuerden - stattdessen per nativem require() zur Laufzeit laden.
  serverExternalPackages: ["discord.js", "@discordjs/ws"],
};

export default nextConfig;
