import dictionary from "dictionary-de";
import nspellFactory from "nspell";
import { prisma } from "@/lib/prisma";
import { fetchPriceSourceItems } from "@/lib/priceSource";
import { JUGENDSPRACHE_WOERTER } from "@/lib/wordChainSlang";
import { GEOGRAFIE_WOERTER } from "@/lib/wordChainGeo";
import { WORD_CHAIN_REUSE_GAP } from "@/lib/constants";

// Einmalig beim ersten Import geladen (nspell + Duden-Woerterbuch), danach
// wiederverwendet - Laden dauert unter einer Sekunde, ein Objekt pro Prozess
// reicht. dictionary-de liefert Uint8Array, nspell/@types/nspell erwarten
// Buffer - zur Laufzeit dasselbe, aber Buffer.from() macht auch TypeScript zufrieden.
const spell = nspellFactory(Buffer.from(dictionary.aff), Buffer.from(dictionary.dic));

const WORD_PATTERN = /^[a-zA-ZäöüÄÖÜß]+$/;

/**
 * Prueft, ob eine Nachricht ueberhaupt wie ein Wortketten-Versuch aussieht:
 * genau ein Wort, nur Buchstaben (inkl. Umlaute/ß), sinnvolle Laenge. Alles
 * andere (mehrere Woerter, Links, Emojis, Zahlen, Anhaenge) wird als normaler
 * Chat behandelt und komplett ignoriert - keine Reaktion, keine Pruefung.
 */
export function normalizeAttempt(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  if (!WORD_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Prueft ein Wort case-insensitiv gegen das Duden-Woerterbuch: deutsche
 * Substantive muessen dort grossgeschrieben stehen, im lockeren Discord-Chat
 * schreibt aber kaum jemand konsequent gross/klein. Deshalb werden alle drei
 * gaengigen Schreibweisen probiert (Original, komplett klein, Erster-Buchstabe-
 * gross) statt stur nur die exakte Schreibweise zu pruefen.
 */
function isValidGermanWord(word: string): boolean {
  const variants = new Set([
    word,
    word.toLowerCase(),
    word[0].toUpperCase() + word.slice(1).toLowerCase(),
  ]);
  for (const variant of variants) {
    if (spell.correct(variant)) return true;
  }
  return false;
}

let itemWordsCache: { words: Set<string>; fetchedAt: number } | null = null;
const ITEM_WORDS_CACHE_TTL_MS = 10 * 60 * 1000;

function extractWordTokens(name: string): string[] {
  return name
    .split(/[^a-zA-ZäöüÄÖÜß]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
}

/**
 * Baut die Menge bekannter deutscher Minecraft-Item-Woerter aus zwei Quellen:
 * dem eigenen LeihCenter-Katalog und der externen Preisquelle (btc-clan.xyz).
 * Mehrwortige Namen ("OP Schwamm", "Bohrer V3") werden in Einzelwoerter
 * zerlegt, da im Wortkettenspiel ohnehin nur ein Wort pro Nachricht zaehlt.
 * 10 Minuten gecacht, damit nicht bei jeder Nachricht neu abgefragt wird.
 */
async function getKnownItemWords(): Promise<Set<string>> {
  if (itemWordsCache && Date.now() - itemWordsCache.fetchedAt < ITEM_WORDS_CACHE_TTL_MS) {
    return itemWordsCache.words;
  }

  const words = new Set<string>();
  try {
    const items = await prisma.item.findMany({ select: { name: true } });
    for (const item of items) {
      for (const token of extractWordTokens(item.name)) words.add(token);
    }
  } catch {
    // Eigener Katalog nicht erreichbar - trotzdem mit dem weitermachen, was wir haben.
  }

  try {
    const sourceItems = await fetchPriceSourceItems();
    for (const item of sourceItems) {
      for (const token of extractWordTokens(item.name)) words.add(token);
    }
  } catch {
    // Preisquelle nicht erreichbar - kein harter Fehler, nur weniger Abdeckung.
  }

  itemWordsCache = { words, fetchedAt: Date.now() };
  return words;
}

/**
 * Direkte Pruefung ohne Komposita-Zerlegung: Duden-Woerterbuch, Jugendsprache,
 * bekannte Minecraft-Item-Woerter.
 */
async function isKnownBaseWord(word: string): Promise<boolean> {
  if (isValidGermanWord(word)) return true;
  if (JUGENDSPRACHE_WOERTER.has(word.toLowerCase())) return true;
  if (GEOGRAFIE_WOERTER.has(word.toLowerCase())) return true;
  const itemWords = await getKnownItemWords();
  if (itemWords.has(word.toLowerCase())) return true;
  return false;
}

// Deutsch ist extrem kompositionsfreudig (Eingang+Tür = "Eingangstür") - im
// Hunspell-Woerterbuch stehen nur die Einzelteile, keine der unendlich vielen
// moeglichen Zusammensetzungen. nspell unterstuetzt die COMPOUNDBEGIN/MIDDLE/
// END-Regeln des deutschen Woerterbuchs nicht, deshalb hier eine eigene,
// rekursive Zerlegung: an jeder moeglichen Stelle splitten, linken Teil (ggf.
// nach Abzug eines Fugenlauts wie "s"/"es"/"n") und rechten Teil je einzeln
// oder wieder zusammengesetzt pruefen.
const MIN_COMPOUND_PART_LEN = 3;
const FUGENLAUTE = ["ens", "es", "ns", "en", "er", "s", "n", "e"];

async function isCompoundPart(part: string): Promise<boolean> {
  if (await isKnownBaseWord(part)) return true;
  for (const fuge of FUGENLAUTE) {
    if (part.length <= fuge.length || !part.toLowerCase().endsWith(fuge)) continue;
    const stripped = part.slice(0, part.length - fuge.length);
    if (stripped.length >= MIN_COMPOUND_PART_LEN && (await isKnownBaseWord(stripped))) return true;
  }
  return false;
}

async function canDecomposeCompound(word: string, depth = 0): Promise<boolean> {
  if (depth > 4) return false; // Sicherheitslimit gegen entartete Rekursion
  if (word.length < MIN_COMPOUND_PART_LEN * 2) return false;

  for (let i = MIN_COMPOUND_PART_LEN; i <= word.length - MIN_COMPOUND_PART_LEN; i++) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    if (!(await isCompoundPart(left))) continue;
    if ((await isCompoundPart(right)) || (await canDecomposeCompound(right, depth + 1))) return true;
  }
  return false;
}

async function isKnownWord(word: string): Promise<boolean> {
  if (await isKnownBaseWord(word)) return true;
  return canDecomposeCompound(word);
}

export type WordChainResult =
  | { kind: "ignored" }
  | { kind: "accepted"; word: string }
  | { kind: "rejected"; word: string; reason: string };

/**
 * Verarbeitet einen Wortketten-Versuch vollstaendig: Regelpruefung in fester
 * Reihenfolge (Reihenfolge/Doppel-Zug -> Anfangsbuchstabe -> Wiederholung ->
 * Gueltigkeit) und bei Erfolg das Eintragen in die Kette. Alles innerhalb
 * einer Transaktion, damit zwei fast gleichzeitige Nachrichten sich nicht
 * gegenseitig einen falschen turnIndex unterschieben.
 */
export async function processWordChainAttempt(
  channelId: string,
  discordId: string,
  rawContent: string
): Promise<WordChainResult> {
  const word = normalizeAttempt(rawContent);
  if (!word) return { kind: "ignored" };
  const wordLower = word.toLowerCase();

  const game = await prisma.wordChainGame.upsert({
    where: { channelId },
    update: {},
    create: { channelId },
  });

  return prisma.$transaction(async (tx) => {
    const latest = await tx.wordChainEntry.findFirst({
      where: { gameId: game.id },
      orderBy: { turnIndex: "desc" },
    });

    if (latest && latest.discordId === discordId) {
      return {
        kind: "rejected",
        word,
        reason:
          "Du bist doppelt dran – warte, bis jemand anderes ein Wort geschrieben hat, bevor du wieder spielst.",
      } as const;
    }

    if (latest) {
      // Kein deutsches Wort beginnt mit "ß" - endet die Kette darauf, gilt
      // wie ueblich beim Wortkettenspiel "s" als naechster Anfangsbuchstabe.
      const lastLetter = latest.word.slice(-1).toLowerCase();
      const requiredLetter = lastLetter === "ß" ? "s" : lastLetter;
      const actualLetter = word[0].toLowerCase();
      if (actualLetter !== requiredLetter) {
        const hint =
          lastLetter === "ß"
            ? ` (bei „${latest.word}“ zählt „ß“ wie „s“)`
            : ` (letzter Buchstabe von „${latest.word}“)`;
        return {
          kind: "rejected",
          word,
          reason: `Dein Wort muss mit „${requiredLetter.toUpperCase()}“ beginnen${hint}.`,
        } as const;
      }
    }

    const priorUse = await tx.wordChainEntry.findFirst({
      where: { gameId: game.id, wordLower },
      orderBy: { turnIndex: "desc" },
    });
    if (priorUse) {
      const gap = (latest?.turnIndex ?? 0) - priorUse.turnIndex;
      if (gap < WORD_CHAIN_REUSE_GAP) {
        return {
          kind: "rejected",
          word,
          reason: `Das Wort „${word}“ wurde schon vor Kurzem verwendet – dazwischen müssen mindestens ${WORD_CHAIN_REUSE_GAP} andere Wörter liegen.`,
        } as const;
      }
    }

    if (!(await isKnownWord(word))) {
      return {
        kind: "rejected",
        word,
        reason: `„${word}“ ist kein bekanntes deutsches Wort (Duden), keine bekannte Jugendsprache, kein bekannter Städte-/Fluss-/Ländername und kein bekannter Minecraft-Item-Name – oder es ist falsch geschrieben.`,
      } as const;
    }

    const nextTurnIndex = (latest?.turnIndex ?? 0) + 1;
    await tx.wordChainEntry.create({
      data: { gameId: game.id, turnIndex: nextTurnIndex, word, wordLower, discordId },
    });

    return { kind: "accepted", word } as const;
  });
}

/** Setzt die Kette in einem Kanal komplett zurueck ("/wortketten-reset"). */
export async function resetWordChain(channelId: string): Promise<void> {
  const game = await prisma.wordChainGame.findUnique({ where: { channelId } });
  if (!game) return;
  await prisma.wordChainEntry.deleteMany({ where: { gameId: game.id } });
}
