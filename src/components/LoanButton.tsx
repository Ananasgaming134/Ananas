"use client";

import { useActionState } from "react";
import { borrowItem, returnLoan, type LoanActionState } from "@/app/actions/loans";

const initialState: LoanActionState = null;

/**
 * Knopf zum Ausleihen bzw. Zurueckgeben.
 *
 * Wichtig ist die Rueckmeldung: vorher war das ein nackter Absende-Knopf ohne
 * jeden Zustand. Wer klickte, sah bis zum Neuaufbau der Seite nichts - und
 * klickte deshalb noch einmal. Jetzt zeigt der Knopf sofort, dass er arbeitet,
 * sperrt sich dabei gegen Doppelklicks, und wenn die Ausleihe abgelehnt wird
 * (Sperre, Pause, kein Abo, Item schon weg), steht der Grund darunter statt
 * unsichtbar zu verpuffen.
 */
export default function LoanButton({
  art,
  id,
  className,
  children,
}: {
  art: "ausleihen" | "zurueckgeben";
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const aktion = art === "ausleihen" ? borrowItem : returnLoan;
  const [state, formAction, pending] = useActionState(aktion.bind(null, id), initialState);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} className={className} aria-busy={pending}>
        {pending ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="loan-spinner" aria-hidden />
            {art === "ausleihen" ? "Wird ausgeliehen..." : "Wird zurückgegeben..."}
          </span>
        ) : (
          children
        )}
      </button>

      {state?.ok === false && state.error && (
        <p className="mt-2 text-center text-[11px] leading-snug text-danger">{state.error}</p>
      )}
    </form>
  );
}
