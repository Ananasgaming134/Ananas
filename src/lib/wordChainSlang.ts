// Kuratierte Liste gaengiger deutscher Jugendsprache fuer das Wortkettenspiel
// (siehe src/lib/wordChain.ts) - Woerter, die im Duden-Wortschatz (nspell)
// fehlen, im echten Sprachgebrauch aber gaengig/bekannt sind. Nur einzelne
// Woerter (keine Mehrwort-Ausdruecke), da im Spiel ohnehin nur ein Wort pro
// Nachricht zaehlt. Bei Bedarf einfach ergaenzen.
export const JUGENDSPRACHE_WOERTER = new Set(
  [
    "digga", "diggi", "digger", "alter", "alta", "bro", "bruh", "bruder",
    "junge", "opfer", "cringe", "sus", "sussy", "goofy", "aura", "rizz",
    "rizzler", "npc", "lost", "cap", "safe", "vibe", "vibes", "chillen",
    "chillig", "chillt", "gechillt", "flexen", "flex", "geflext", "lit",
    "sheesh", "talahon", "sigma", "simp", "based", "mid", "bodenlos",
    "wallah", "yalla", "goennen", "gönnen", "gönnt", "goennt", "geil",
    "krass", "hammer", "nice", "dope", "fresh", "stylen", "styling",
    "zocken", "zocker", "noob", "tryhard", "ghosten", "ghosting",
    "catfish", "bestie", "homie", "squad", "crew", "drip", "fit", "slay",
    "iconic", "delulu", "brainrot", "skibidi", "poggers", "pog", "kek",
    "lmao", "lol", "rofl", "abgehen", "tilt", "getiltet", "dissen", "diss",
    "geddisst", "boosten", "geboostet", "fomo", "yolo", "swag", "läuft",
    "laeuft", "cool", "cringy", "toxisch", "canceln", "gecancelt",
  ].map((w) => w.toLowerCase())
);
