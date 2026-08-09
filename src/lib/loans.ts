import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { LOAN_STATUS, type LoanChannelValue } from "@/lib/constants";

export type LoanActionResult =
  | { ok: true; loanId: string }
  | { ok: false; error: string };

/**
 * Kernlogik zum Ausleihen eines Items - bewusst ohne "use server" und ohne
 * Next.js-spezifische Aufrufe (redirect/revalidatePath), damit sie sowohl
 * von der Web-Server-Action (src/app/actions/loans.ts) als auch vom
 * Discord-Bot (Interactions-Route) genutzt werden kann. Aufrufer sind fuer
 * revalidatePath/Panel-Refresh danach selbst verantwortlich.
 */
export async function borrowItemCore(
  itemId: string,
  memberId: string,
  channel: LoanChannelValue
): Promise<LoanActionResult> {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item nicht gefunden." };

  const [activeLoansForItem, alreadyBorrowed] = await Promise.all([
    prisma.loan.count({ where: { itemId, status: LOAN_STATUS.ACTIVE } }),
    prisma.loan.findFirst({ where: { itemId, memberId, status: LOAN_STATUS.ACTIVE } }),
  ]);

  if (alreadyBorrowed) return { ok: false, error: "Du hast dieses Item bereits ausgeliehen." };
  if (activeLoansForItem >= item.quantityTotal) {
    return { ok: false, error: "Item ist aktuell nicht verfügbar." };
  }

  const loan = await prisma.loan.create({
    data: { itemId, memberId, channel },
  });
  await logAction({
    actorId: memberId,
    targetId: memberId,
    action: "ITEM_BORROWED",
    details: `"${item.name}" ausgeliehen (Loan ${loan.id}, Kanal ${channel})`,
  });

  return { ok: true, loanId: loan.id };
}

/**
 * Kernlogik zur Rueckgabe. `memberId` muss zum Loan gehoeren (kein
 * fremdes Zurueckgeben ueber die API).
 */
export async function returnLoanCore(loanId: string, memberId: string): Promise<LoanActionResult> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { item: true } });
  if (!loan || loan.memberId !== memberId || loan.status !== LOAN_STATUS.ACTIVE) {
    return { ok: false, error: "Ausleihe nicht gefunden oder bereits zurückgegeben." };
  }

  await prisma.loan.update({
    where: { id: loanId },
    data: { status: LOAN_STATUS.RETURNED, returnedAt: new Date() },
  });
  await logAction({
    actorId: memberId,
    targetId: memberId,
    action: "ITEM_RETURNED",
    details: `"${loan.item.name}" zurückgegeben (Loan ${loanId})`,
  });

  return { ok: true, loanId };
}

/** Findet die aktive Ausleihe eines Mitglieds fuer ein bestimmtes Item, falls vorhanden. */
export async function findActiveLoan(itemId: string, memberId: string) {
  return prisma.loan.findFirst({
    where: { itemId, memberId, status: LOAN_STATUS.ACTIVE },
  });
}
