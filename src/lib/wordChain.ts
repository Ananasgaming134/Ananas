import dictionary from "dictionary-de";
import nspellFactory from "nspell";
import { prisma } from "@/lib/prisma";
import { fetchPriceSourceItems } from "@/lib/priceSource";
import { JUGENDSPRACHE_WOERTER } from "@/lib/wordChainSlang";
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

async function isKnownWord(word: string): Promise<boolean> {
  if (isValidGermanWord(word)) return true;
  if (JUGENDSPRACHE_WOERTER.has(word.toLowerCase())) return true;
  const itemWords = await getKnownItemWords();
  if (itemWords.has(word.toLowerCase())) return true;
  return false;
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
      const requiredLetter = latest.word.slice(-1).toLowerCase();
      const actualLetter = word[0].toLowerCase();
      if (actualLetter !== requiredLetter) {
        return {
          kind: "rejected",
          word,
          reason: `Dein Wort muss mit „${requiredLetter.toUpperCase()}“ beginnen (letzter Buchstabe von „${latest.word}“).`,
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
        reason: `„${word}“ ist kein bekanntes deutsches Wort (Duden), keine bekannte Jugendsprache und kein bekannter Minecraft-Item-Name – oder es ist falsch geschrieben.`,
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
