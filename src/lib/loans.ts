import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  BORROW_DURATION_MS,
  LOAN_STATUS,
  REBORROW_COOLDOWN_MS,
  type LoanChannelValue,
} from "@/lib/constants";

export type LoanActionResult =
  | { ok: true; loanId: string }
  | { ok: false; error: string };

function formatMinutes(ms: number): string {
  return String(Math.ceil(ms / 60_000));
}

/**
 * Kernlogik zum Ausleihen eines Items - bewusst ohne "use server" und ohne
 * Next.js-spezifische Aufrufe (redirect/revalidatePath), damit sie sowohl
 * von der Web-Server-Action (src/app/actions/loans.ts) als auch vom
 * Discord-Bot (Interactions-Route) genutzt werden kann. Aufrufer sind fuer
 * revalidatePath/Panel-Refresh danach selbst verantwortlich.
 *
 * Setzt jede Ausleihe fest auf eine 2h-Frist (dueAt). Blockt zusaetzlich:
 * - eine aktive Ausleih-Sperre (member.borrowSuspendedUntil), z.B. nach zu
 *   spaeter Rueckgabe einer frueheren Ausleihe
 * - eine 30-Minuten-Abklingzeit auf DASSELBE Item nach dessen letzter
 *   Rueckgabe durch dieselbe Person (verhindert sofortiges Neu-Ausleihen)
 */
export async function borrowItemCore(
  itemId: string,
  memberId: string,
  channel: LoanChannelValue
): Promise<LoanActionResult> {
  const [item, member] = await Promise.all([
    prisma.item.findUnique({ where: { id: itemId } }),
    prisma.member.findUnique({ where: { id: memberId } }),
  ]);
  if (!item) return { ok: false, error: "Item nicht gefunden." };
  if (!member) return { ok: false, error: "Mitglied nicht gefunden." };

  const now = new Date();

  if (member.borrowSuspendedUntil && member.borrowSuspendedUntil > now) {
    const remaining = formatMinutes(member.borrowSuspendedUntil.getTime() - now.getTime());
    return {
      ok: false,
      error: `Du bist aktuell für das Ausleihen gesperrt (noch ${remaining} Min.)${
        member.borrowSuspendedReason ? ` — Grund: ${member.borrowSuspendedReason}` : ""
      }.`,
    };
  }

  const [activeLoansForItem, alreadyBorrowed, lastReturnOfItem] = await Promise.all([
    prisma.loan.count({ where: { itemId, status: LOAN_STATUS.ACTIVE } }),
    prisma.loan.findFirst({ where: { itemId, memberId, status: LOAN_STATUS.ACTIVE } }),
    prisma.loan.findFirst({
      where: { itemId, memberId, status: LOAN_STATUS.RETURNED },
      orderBy: { returnedAt: "desc" },
    }),
  ]);

  if (alreadyBorrowed) return { ok: false, error: "Du hast dieses Item bereits ausgeliehen." };

  if (lastReturnOfItem?.returnedAt) {
    const cooldownEnd = lastReturnOfItem.returnedAt.getTime() + REBORROW_COOLDOWN_MS;
    if (cooldownEnd > now.getTime()) {
      const remaining = formatMinutes(cooldownEnd - now.getTime());
      return {
        ok: false,
        error: `Dieses Item kannst du erst in ${remaining} Min. wieder ausleihen (30 Min. Pause nach Rückgabe). In dieser Zeit darfst du es auch nicht im Inventar haben.`,
      };
    }
  }

  if (activeLoansForItem >= item.quantityTotal) {
    return { ok: false, error: "Item ist aktuell nicht verfügbar." };
  }

  const loan = await prisma.loan.create({
    data: { itemId, memberId, channel, dueAt: new Date(now.getTime() + BORROW_DURATION_MS) },
  });
  await logAction({
    actorId: memberId,
    targetId: memberId,
    action: "ITEM_BORROWED",
    details: `"${item.name}" ausgeliehen (Loan ${loan.id}, Kanal ${channel}, Frist 2h)`,
  });

  return { ok: true, loanId: loan.id };
}

export type ReturnResult =
  | { ok: true; loanId: string; itemName: string; cooldownEndsAt: Date }
  | { ok: false; error: string };

/**
 * Kernlogik zur Rueckgabe. `memberId` muss zum Loan gehoeren (kein
 * fremdes Zurueckgeben ueber die API). Liefert bei Erfolg zusaetzlich mit,
 * bis wann die 30-Minuten-Abklingzeit fuer dasselbe Item laeuft, damit
 * Aufrufer (Website, Discord) das direkt anzeigen koennen, ohne separat
 * nachzufragen.
 */
export async function returnLoanCore(loanId: string, memberId: string): Promise<ReturnResult> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { item: true } });
  if (!loan || loan.memberId !== memberId || loan.status !== LOAN_STATUS.ACTIVE) {
    return { ok: false, error: "Ausleihe nicht gefunden oder bereits zurückgegeben." };
  }

  const returnedAt = new Date();
  await prisma.loan.update({
    where: { id: loanId },
    data: { status: LOAN_STATUS.RETURNED, returnedAt },
  });
  await logAction({
    actorId: memberId,
    targetId: memberId,
    action: "ITEM_RETURNED",
    details: `"${loan.item.name}" zurückgegeben (Loan ${loanId})`,
  });

  return {
    ok: true,
    loanId,
    itemName: loan.item.name,
    cooldownEndsAt: new Date(returnedAt.getTime() + REBORROW_COOLDOWN_MS),
  };
}

/** Findet die aktive Ausleihe eines Mitglieds fuer ein bestimmtes Item, falls vorhanden. */
export async function findActiveLoan(itemId: string, memberId: string) {
  return prisma.loan.findFirst({
    where: { itemId, memberId, status: LOAN_STATUS.ACTIVE },
  });
}
