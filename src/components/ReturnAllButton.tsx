"use client";

import { useActionState } from "react";
import { returnAllLoans, type LoanActionState } from "@/app/actions/loans";

const initialState: LoanActionState = null;

/**
 * Gibt alle laufenden Ausleihen auf einmal zurueck.
 *
 * Sichtbar schon ab einer Ausleihe: erschien er erst ab zwei, wusste niemand,
 * dass es ihn ueberhaupt gibt - man sieht ihn ja nur in genau dem Moment, in
 * dem man ihn braucht.
 */
export default function ReturnAllButton({ anzahl }: { anzahl: number }) {
  const [state, formAction, pending] = useActionState(returnAllLoans, initialState);

  if (anzahl < 1) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-4 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20 disabled:cursor-wait disabled:opacity-60"
      >
        {pending
          ? "Wird zurückgegeben..."
          : anzahl === 1
            ? "Zurückgeben"
            : `Alle ${anzahl} auf einmal zurückgeben`}
      </button>
      {state?.ok === false && state.error && (
        <p className="text-xs text-danger">❌ {state.error}</p>
      )}
      {state?.ok && <p className="text-xs text-accent-2">✅ Alles zurückgegeben.</p>}
    </form>
  );
}
