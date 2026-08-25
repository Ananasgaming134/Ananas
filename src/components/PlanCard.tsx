"use client";

import { useActionState } from "react";
import { purchasePlan, type PlanChangeState } from "@/app/actions/planChanges";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

const initialState: PlanChangeState = null;

const MERKMALE = [
  "Kompletter Item-Bestand",
  "Ausleihen über Website und Discord",
  "Erinnerungen per Direktnachricht",
  "Pausieren jederzeit per Ticket",
];

/**
 * Eine Paket-Karte, die man direkt buchen kann - die Auswahl passiert also
 * an der Karte selbst und nicht ueber eine getrennte Liste weiter unten.
 * Reicht das Guthaben nicht, sagt der Knopf, wie viel fehlt.
 */
export default function PlanCard({
  plan,
  index,
  balance,
  currentPlanId,
  hatAbo,
  hervorgehoben,
  ersparnis,
}: {
  plan: SubscriptionPlan;
  index: number;
  balance: number;
  currentPlanId: string | null;
  hatAbo: boolean;
  hervorgehoben: boolean;
  ersparnis: number;
}) {
  const [state, formAction, pending] = useActionState(purchasePlan, initialState);

  const aktuell = currentPlanId === plan.id;
  const reicht = balance >= plan.price;
  const fehlt = plan.price - balance;
  const proMonat = Math.round(plan.price / plan.months);

  const knopfText = pending
    ? "Wird gebucht..."
    : !reicht
      ? `Es fehlen ${formatCoins(fehlt)}`
      : hatAbo
        ? aktuell
          ? "Verlängern"
          : "Auf dieses Paket wechseln"
        : "Jetzt buchen";

  return (
    // Aeusserer Rahmen ohne overflow-hidden: das Band ragt bewusst ueber die
    // Kartenkante hinaus.
    <div className={`fade-up fade-up-${index + 1} relative`}>
      {hervorgehoben && (
        <span className="absolute -top-2.5 right-5 z-10 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-black shadow-md">
          ⭐ Beliebt
        </span>
      )}

      <form
        action={formAction}
        className={`card-hover relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 ${
          hervorgehoben
            ? "border-accent/60 bg-gradient-to-b from-accent/10 via-surface to-surface shadow-[0_0_40px_-12px_var(--accent)]"
            : "border-border bg-surface"
        }`}
      >
        <input type="hidden" name="planId" value={plan.id} />
        {hervorgehoben && <div className="gradient-top-bar" />}

        {aktuell && (
          <span className="mb-2 inline-block self-start rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-0.5 text-[10px] font-medium text-accent-2">
            ✓ Dein aktuelles Paket
          </span>
        )}

        <p className="text-base font-semibold">{plan.label}</p>
        <p className="mt-3 text-3xl font-bold tracking-tight text-accent">
          {formatCoins(plan.price)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {formatCoins(proMonat)} / Monat
          {ersparnis > 0 && (
            <span className="ml-1.5 rounded-full bg-accent-2/15 px-1.5 py-0.5 font-medium text-accent-2">
              -{ersparnis}%
            </span>
          )}
        </p>

        <ul className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted">
          {MERKMALE.map((merkmal) => (
            <li key={merkmal} className="flex items-start gap-2">
              <span className="mt-0.5 text-accent-2" aria-hidden>
                ✓
              </span>
              <span>{merkmal}</span>
            </li>
          ))}
        </ul>

        {/* mt-auto haelt die Knoepfe aller drei Karten auf einer Linie,
            auch wenn oben unterschiedlich viel Platz gebraucht wird. */}
        <div className="mt-auto pt-5">
          <button
            type="submit"
            disabled={pending || !reicht}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
              hervorgehoben
                ? "bg-accent text-black hover:brightness-110 disabled:opacity-50"
                : "border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
            }`}
          >
            {knopfText}
          </button>

          {state?.error && <p className="mt-2 text-xs text-danger">❌ {state.error}</p>}
          {state?.ok && (
            <p className="mt-2 text-xs text-accent-2">
              ✅ Gebucht — der Betrag wurde vom Guthaben abgezogen.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
