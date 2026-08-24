import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendDiscordDirectMessage } from "@/lib/discord";
import { RETURN_PREFIX } from "@/lib/discordInteractions";
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
  if (item.unavailable) {
    return {
      ok: false,
      error: item.unavailableReason
        ? `Dieses Item ist derzeit nicht ausleihbar: ${item.unavailableReason}`
        : "Dieses Item ist derzeit nicht ausleihbar.",
    };
  }
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

  if (member.pausedAt) {
    return { ok: false, error: "Dein Abo ist aktuell pausiert - solange kannst du nichts ausleihen." };
  }

  if (!member.feePaidUntil || member.feePaidUntil < now) {
    return { ok: false, error: "Du brauchst ein aktives, bezahltes Abo, um etwas auszuleihen." };
  }

  if (!member.verifiedAt) {
    return {
      ok: false,
      error:
        "Du musst deinen Minecraft-Account verifizieren, bevor du ausleihen kannst - das geht auf der Website unter „Profil“.",
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

  // Bestaetigung per DM samt Rueckgabe-Knopf - so hat man seine laufenden
  // Ausleihen und die Frist immer griffbereit, ohne einen Kanal zu suchen.
  await sendBorrowConfirmationDm(member.discordId, item.name, loan.id, loan.dueAt).catch(() => {});

  return { ok: true, loanId: loan.id };
}

/** DM nach dem Ausleihen: Item, Rueckgabefrist und ein Knopf zum Zurueckgeben. */
async function sendBorrowConfirmationDm(
  discordId: string,
  itemName: string,
  loanId: string,
  dueAt: Date | null
): Promise<void> {
  const dueLine = dueAt
    ? `Zurückgeben bis <t:${Math.floor(dueAt.getTime() / 1000)}:t> (<t:${Math.floor(dueAt.getTime() / 1000)}:R>)`
    : "Bitte zeitnah zurückgeben.";

  await sendDiscordDirectMessage(discordId, {
    embeds: [
      {
        title: "📦 Ausgeliehen",
        description: `**${itemName}**\n${dueLine}\n\nMit dem Knopf unten gibst du direkt zurück.`,
        color: 0x3ddc97,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: `↩️ ${itemName}`.slice(0, 80), custom_id: `${RETURN_PREFIX}${loanId}` },
        ],
      },
    ],
  });
}

export type ReturnResult =
  | { ok: true; loanId: string; itemName: string; cooldownEndsAt: Date }
  | { ok: false; error: string };

/**
 * Kernlogik zur Rueckgabe. Standardmaessig darf nur zurueckgeben, wem die
 * Ausleihe auch gehoert - niemand kann eine fremde Ausleihe "uebersteuern".
 * Mit `allowForeign` (nur fuer Aufsicht/Owner, Berechtigung prueft der
 * Aufrufer) laesst sich das gezielt aushebeln, z.B. wenn jemand ein Item
 * abgegeben, aber vergessen hat es auszubuchen.
 *
 * Eine Rueckgabe ist jederzeit moeglich - insbesondere auch VOR Ablauf der
 * 2h-Frist; die Frist begrenzt nur, wie lange man das Item behalten darf.
 */
export async function returnLoanCore(
  loanId: string,
  actorMemberId: string,
  options: { allowForeign?: boolean } = {}
): Promise<ReturnResult> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { item: true } });
  if (!loan || loan.status !== LOAN_STATUS.ACTIVE) {
    return { ok: false, error: "Ausleihe nicht gefunden oder bereits zurückgegeben." };
  }
  if (loan.memberId !== actorMemberId && !options.allowForeign) {
    return { ok: false, error: "Das ist nicht deine Ausleihe." };
  }

  const isForeign = loan.memberId !== actorMemberId;
  const returnedAt = new Date();
  await prisma.loan.update({
    where: { id: loanId },
    data: { status: LOAN_STATUS.RETURNED, returnedAt },
  });
  await logAction({
    actorId: actorMemberId,
    targetId: loan.memberId,
    action: "ITEM_RETURNED",
    details: `"${loan.item.name}" zurückgegeben (Loan ${loanId})${isForeign ? " - durch Aufsicht/Owner für das Mitglied ausgebucht" : ""}`,
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
