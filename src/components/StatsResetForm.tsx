"use client";

import { useActionState } from "react";
import { resetLoanStats, type StatsResetState } from "@/app/actions/stats";

const initialState: StatsResetState = null;

/**
 * Setzt die Ausleih-Statistik zurueck. Bewusst mit Tippbestaetigung: das
 * laesst sich nicht rueckgaengig machen, und ein Fehlklick waere teuer.
 */
export default function StatsResetForm({
  abgeschlossen,
  laufend,
}: {
  abgeschlossen: number;
  laufend: number;
}) {
  const [state, formAction, pending] = useActionState(resetLoanStats, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted">
        Löscht die <span className="text-foreground">{abgeschlossen} abgeschlossenen Ausleihen</span>,
        aus denen alle Zahlen gerechnet werden — Gesamtzahl, meistgeliehene Items und Kategorien,
        aktivste Kunden, Web/Discord-Verteilung. Danach wird bei null neu gezählt.
      </p>
      <p className="text-sm text-muted">
        {laufend > 0 ? (
          <>
            Die <span className="text-foreground">{laufend} laufende{laufend === 1 ? "" : "n"}</span>{" "}
            Ausleihe{laufend === 1 ? "" : "n"} bleib{laufend === 1 ? "t" : "en"} bestehen — die Items
            sind ja wirklich draußen und müssen zurückgegeben werden können.
          </>
        ) : (
          "Aktuell ist nichts ausgeliehen."
        )}{" "}
        Die Ausleihhistorie in den Akten verschwindet damit ebenfalls. Guthaben, Abos, Strafen und
        Bewertungen bleiben unberührt.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          name="bestaetigung"
          required
          placeholder="ZURÜCKSETZEN eintippen"
          autoComplete="off"
          className="w-56 rounded-lg border border-danger/40 bg-surface px-3 py-2 text-sm outline-none ring-danger/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Wird zurückgesetzt..." : "Statistik zurücksetzen"}
        </button>
      </div>

      {state?.error && <p className="text-xs text-danger">❌ {state.error}</p>}
      {state?.ok && <p className="text-xs text-accent-2">✅ {state.hinweis}</p>}
    </form>
  );
}
