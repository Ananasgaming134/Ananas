"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { LOAN_STATUS, ROLES } from "@/lib/constants";

export type StatsResetState = { ok: boolean; hinweis?: string; error?: string } | null;

/**
 * Setzt die Ausleih-Statistik zurueck. Es gibt keine eigene Statistik-Tabelle
 * - alle Zahlen werden aus den Ausleihen gerechnet. Zuruecksetzen heisst also,
 * die abgeschlossene Historie zu loeschen.
 *
 * LAUFENDE Ausleihen bleiben bewusst stehen: die Items sind wirklich drausssen.
 * Wuerde man sie mitloeschen, gaelten sie als frei, waehrend jemand sie noch
 * hat, und die Rueckgabe-Knoepfe zeigten ins Leere.
 *
 * Nur Owner, und nicht umkehrbar - deshalb muss der Name des LeihCenters zur
 * Bestaetigung eingetippt werden.
 */
export async function resetLoanStats(
  _prev: StatsResetState,
  formData: FormData
): Promise<StatsResetState> {
  const actor = await requireMember(ROLES.OWNER);

  if (String(formData.get("bestaetigung") ?? "").trim() !== "ZURÜCKSETZEN") {
    return { ok: false, error: 'Zum Bestätigen bitte ZURÜCKSETZEN eintippen.' };
  }

  const laufend = await prisma.loan.count({ where: { status: LOAN_STATUS.ACTIVE } });
  const result = await prisma.loan.deleteMany({ where: { status: { not: LOAN_STATUS.ACTIVE } } });

  await logAction({
    actorId: actor.id,
    action: "STATS_RESET",
    details: `Ausleih-Statistik zurückgesetzt: ${result.count} abgeschlossene Ausleihen gelöscht, ${laufend} laufende behalten.`,
  });

  revalidatePath("/dashboard/verwaltung/statistik");
  revalidatePath("/dashboard/statistik");
  revalidatePath("/dashboard/verwaltung");
  revalidatePath("/dashboard");
  revalidatePath("/");

  return {
    ok: true,
    hinweis:
      `${result.count} abgeschlossene Ausleihen gelöscht. ` +
      `${laufend} laufende Ausleihe(n) bleiben bestehen — ab jetzt wird neu gezählt.`,
  };
}
