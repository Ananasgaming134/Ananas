"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import { refreshPanelsQuietly, syncCategoryChannelsQuietly } from "@/lib/discordPanel";
import { LOAN_CHANNEL, LOAN_STATUS, ROLES } from "@/lib/constants";

export type LoanActionState = { ok: boolean; error?: string } | null;

function refreshItemPages() {
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/akte");
  revalidatePath("/dashboard/verwaltung");
  revalidatePath("/dashboard/verwaltung/ausleihen");
}

/**
 * Bringt die Discord-Panels auf den neuen Stand - NACH dem Ausliefern der
 * Antwort.
 *
 * Vorher lief das mitten im Klick: der Browser wartete, bis saemtliche
 * Panel-Nachrichten in Discord neu geschrieben waren. Gemessen sind das
 * schon im guenstigen Fall rund 1,7 Sekunden, und da zwischen den Nachrichten
 * bewusst Pausen liegen (sonst sperrt Discord uns aus), wird es beim
 * tatsaechlichen Umschreiben deutlich mehr. Der Knopf fuehlte sich dadurch
 * an, als wuerde er haengen. Jetzt ist die Ausleihe sofort gebucht und
 * Discord zieht im Hintergrund nach.
 */
function discordNachziehen() {
  after(async () => {
    try {
      await refreshPanelsQuietly();
      await syncCategoryChannelsQuietly();
    } catch (err) {
      console.error("[ausleihe] Discord-Panels konnten nicht aktualisiert werden:", err);
    }
  });
}

export async function borrowItem(
  itemId: string,
  _prev?: LoanActionState,
  _formData?: FormData
): Promise<LoanActionState> {
  const member = await requireMember();
  const result = await borrowItemCore(itemId, member.id, LOAN_CHANNEL.WEB);
  refreshItemPages();
  if (result.ok) discordNachziehen();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function returnLoan(
  loanId: string,
  _prev?: LoanActionState,
  _formData?: FormData
): Promise<LoanActionState> {
  const member = await requireMember();
  const result = await returnLoanCore(loanId, member.id);
  refreshItemPages();
  if (result.ok) discordNachziehen();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Gibt alle eigenen laufenden Ausleihen auf einmal zurueck. Wer fuenf Items
 * draussen hat, soll nicht fuenfmal klicken muessen - gerade kurz vor Ablauf
 * der Frist zaehlt jede Sekunde.
 *
 * Fehlschlaege einzelner Rueckgaben brechen den Rest nicht ab; am Ende steht
 * in der Meldung, was durchging und was nicht.
 */
export async function returnAllLoans(
  _prev?: LoanActionState,
  _formData?: FormData
): Promise<LoanActionState> {
  const member = await requireMember();

  const offene = await prisma.loan.findMany({
    where: { memberId: member.id, status: LOAN_STATUS.ACTIVE },
    select: { id: true },
  });
  if (offene.length === 0) return { ok: false, error: "Du hast gerade nichts ausgeliehen." };

  let erfolgreich = 0;
  const fehler: string[] = [];

  for (const loan of offene) {
    const result = await returnLoanCore(loan.id, member.id);
    if (result.ok) erfolgreich += 1;
    else fehler.push(result.error);
  }

  refreshItemPages();
  if (erfolgreich > 0) discordNachziehen();

  if (erfolgreich === 0) {
    return { ok: false, error: fehler[0] ?? "Die Rückgabe hat nicht geklappt." };
  }
  if (fehler.length > 0) {
    return {
      ok: false,
      error: `${erfolgreich} von ${offene.length} zurückgegeben. Bei den übrigen: ${fehler[0]}`,
    };
  }
  return { ok: true };
}

/**
 * Bucht eine FREMDE Ausleihe aus - nur Aufsicht/Owner. Fuer Faelle, in denen
 * jemand das Item abgegeben, aber vergessen hat es selbst zurueckzugeben.
 */
export async function forceReturnLoan(loanId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const result = await returnLoanCore(loanId, actor.id, { allowForeign: true });
  refreshItemPages();
  if (result.ok) discordNachziehen();
}
