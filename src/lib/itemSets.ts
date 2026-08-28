import { prisma } from "@/lib/prisma";
import { borrowItemCore, pruefeAusleihe } from "@/lib/loans";
import { LOAN_CHANNEL, LOAN_STATUS, REBORROW_COOLDOWN_MS } from "@/lib/constants";

/** Mehr passt in kein Set - so bleibt es eine Ausruestung und keine Einkaufsliste. */
export const MAX_SET_ITEMS = 6;
export const MAX_SETS = 10;

export type SetResult = { ok: true } | { ok: false; error: string };

/** Ein Item im Set samt der Frage, ob es sich gerade ausleihen liesse. */
export type SetEintrag = {
  itemId: string;
  name: string;
  imageUrl: string | null;
  kategorie: string | null;
  ausleihbar: boolean;
  /** Warum nicht - nur gesetzt, wenn ausleihbar false ist. */
  grund?: string;
  /** Hat die Person dieses Item schon draussen? Dann ist nichts zu tun. */
  schonDraussen: boolean;
};

export type SetMitLage = {
  id: string;
  name: string;
  eintraege: SetEintrag[];
  /** Wie viele Items sich jetzt tatsaechlich ausleihen liessen. */
  ausleihbar: number;
  /** Wie viele davon die Person bereits draussen hat. */
  schonDraussen: number;
};

/**
 * Laedt die Sets eines Mitglieds und prueft fuer jedes Item, ob es sich
 * gerade ausleihen liesse.
 *
 * Die Pruefung kommt aus derselben Funktion, die auch beim echten Ausleihen
 * entscheidet (pruefeAusleihe) - sonst koennte die Vorschau etwas
 * versprechen, das die Ausleihe hinterher ablehnt.
 */
export async function getSetsWithAvailability(memberId: string): Promise<SetMitLage[]> {
  const [sets, member] = await Promise.all([
    prisma.itemSet.findMany({
      where: { memberId },
      orderBy: { createdAt: "asc" },
      include: {
        entries: {
          include: { item: { include: { category: true } } },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.member.findUnique({ where: { id: memberId } }),
  ]);
  if (!member) return [];

  const itemIds = [...new Set(sets.flatMap((s) => s.entries.map((e) => e.itemId)))];
  if (itemIds.length === 0) {
    return sets.map((s) => ({ id: s.id, name: s.name, eintraege: [], ausleihbar: 0, schonDraussen: 0 }));
  }

  const jetzt = new Date();

  // Alles in drei Abfragen statt in dreien pro Item - bei zehn Sets mit je
  // sechs Items waeren das sonst 180 Abfragen fuer einen Seitenaufruf.
  const [belegung, eigeneAktive, eigeneRueckgaben] = await Promise.all([
    prisma.loan.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, status: LOAN_STATUS.ACTIVE },
      _count: { itemId: true },
    }),
    prisma.loan.findMany({
      where: { memberId, itemId: { in: itemIds }, status: LOAN_STATUS.ACTIVE },
      select: { itemId: true },
    }),
    prisma.loan.findMany({
      where: {
        memberId,
        itemId: { in: itemIds },
        status: LOAN_STATUS.RETURNED,
        returnedAt: { gte: new Date(jetzt.getTime() - REBORROW_COOLDOWN_MS) },
      },
      orderBy: { returnedAt: "desc" },
      select: { itemId: true, returnedAt: true },
    }),
  ]);

  const belegtProItem = new Map(belegung.map((b) => [b.itemId, b._count.itemId]));
  const draussen = new Set(eigeneAktive.map((l) => l.itemId));
  const letzteRueckgabe = new Map<string, Date>();
  for (const l of eigeneRueckgaben) {
    if (l.returnedAt && !letzteRueckgabe.has(l.itemId)) letzteRueckgabe.set(l.itemId, l.returnedAt);
  }

  return sets.map((set) => {
    const eintraege: SetEintrag[] = set.entries.map((eintrag) => {
      const schonDraussen = draussen.has(eintrag.itemId);
      const pruefung = pruefeAusleihe(
        eintrag.item,
        member,
        {
          aktiveAusleihen: belegtProItem.get(eintrag.itemId) ?? 0,
          schonAusgeliehen: schonDraussen,
          letzteRueckgabe: letzteRueckgabe.get(eintrag.itemId) ?? null,
        },
        jetzt
      );

      return {
        itemId: eintrag.itemId,
        name: eintrag.item.name,
        imageUrl: eintrag.item.imageUrl,
        kategorie: eintrag.item.category?.name ?? null,
        ausleihbar: pruefung.ok,
        grund: pruefung.ok ? undefined : pruefung.error,
        schonDraussen,
      };
    });

    return {
      id: set.id,
      name: set.name,
      eintraege,
      ausleihbar: eintraege.filter((e) => e.ausleihbar).length,
      schonDraussen: eintraege.filter((e) => e.schonDraussen).length,
    };
  });
}

/** Stellt sicher, dass das Set wirklich dem Mitglied gehoert. */
async function eigenesSet(setId: string, memberId: string) {
  return prisma.itemSet.findFirst({ where: { id: setId, memberId } });
}

export async function createSetCore(memberId: string, name: string): Promise<SetResult> {
  const titel = name.trim();
  if (!titel) return { ok: false, error: "Gib deinem Set einen Namen." };
  if (titel.length > 40) return { ok: false, error: "Der Name darf höchstens 40 Zeichen haben." };

  const anzahl = await prisma.itemSet.count({ where: { memberId } });
  if (anzahl >= MAX_SETS) {
    return { ok: false, error: `Mehr als ${MAX_SETS} Sets gehen nicht - lösch erst eins.` };
  }

  await prisma.itemSet.create({ data: { memberId, name: titel } });
  return { ok: true };
}

export async function renameSetCore(setId: string, memberId: string, name: string): Promise<SetResult> {
  const titel = name.trim();
  if (!titel) return { ok: false, error: "Der Name darf nicht leer sein." };
  if (titel.length > 40) return { ok: false, error: "Der Name darf höchstens 40 Zeichen haben." };
  if (!(await eigenesSet(setId, memberId))) return { ok: false, error: "Set nicht gefunden." };

  await prisma.itemSet.update({ where: { id: setId }, data: { name: titel } });
  return { ok: true };
}

export async function deleteSetCore(setId: string, memberId: string): Promise<SetResult> {
  if (!(await eigenesSet(setId, memberId))) return { ok: false, error: "Set nicht gefunden." };
  await prisma.itemSet.delete({ where: { id: setId } });
  return { ok: true };
}

export async function addItemToSetCore(
  setId: string,
  memberId: string,
  itemId: string
): Promise<SetResult> {
  if (!(await eigenesSet(setId, memberId))) return { ok: false, error: "Set nicht gefunden." };

  const [anzahl, item, vorhanden] = await Promise.all([
    prisma.itemSetEntry.count({ where: { setId } }),
    prisma.item.findUnique({ where: { id: itemId }, select: { id: true } }),
    prisma.itemSetEntry.findUnique({ where: { setId_itemId: { setId, itemId } } }),
  ]);

  if (!item) return { ok: false, error: "Item nicht gefunden." };
  if (vorhanden) return { ok: false, error: "Das Item ist schon in diesem Set." };
  if (anzahl >= MAX_SET_ITEMS) {
    return { ok: false, error: `In ein Set passen höchstens ${MAX_SET_ITEMS} Items.` };
  }

  await prisma.itemSetEntry.create({ data: { setId, itemId } });
  return { ok: true };
}

export async function removeItemFromSetCore(
  setId: string,
  memberId: string,
  itemId: string
): Promise<SetResult> {
  if (!(await eigenesSet(setId, memberId))) return { ok: false, error: "Set nicht gefunden." };
  await prisma.itemSetEntry.deleteMany({ where: { setId, itemId } });
  return { ok: true };
}

export type SetAusleihErgebnis = {
  ausgeliehen: string[];
  uebersprungen: { name: string; grund: string }[];
};

/**
 * Leiht die Items eines Sets aus. Was nicht geht, wird uebersprungen statt
 * den ganzen Vorgang abzubrechen - wer vier von sechs Teilen bekommen kann,
 * soll die vier bekommen.
 *
 * Entschieden wird pro Item ueber borrowItemCore, nicht ueber die Vorschau:
 * zwischen Anzeigen und Klicken koennen Sekunden liegen, in denen jemand
 * anders schneller war.
 */
export async function borrowSetCore(
  setId: string,
  memberId: string
): Promise<{ ok: true; ergebnis: SetAusleihErgebnis } | { ok: false; error: string }> {
  const set = await prisma.itemSet.findFirst({
    where: { id: setId, memberId },
    include: { entries: { include: { item: { select: { name: true } } }, orderBy: { id: "asc" } } },
  });
  if (!set) return { ok: false, error: "Set nicht gefunden." };
  if (set.entries.length === 0) return { ok: false, error: "In diesem Set sind noch keine Items." };

  const ergebnis: SetAusleihErgebnis = { ausgeliehen: [], uebersprungen: [] };

  for (const eintrag of set.entries) {
    const result = await borrowItemCore(eintrag.itemId, memberId, LOAN_CHANNEL.WEB);
    if (result.ok) ergebnis.ausgeliehen.push(eintrag.item.name);
    else ergebnis.uebersprungen.push({ name: eintrag.item.name, grund: result.error });
  }

  return { ok: true, ergebnis };
}
