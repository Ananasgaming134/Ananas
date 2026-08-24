"use client";

import { useActionState, useState } from "react";
import { saveRules, type RulesFormState } from "@/app/actions/rules";

const initialState: RulesFormState = null;

/**
 * Regelwerk-Editor fuer Owner. Der Text wird 1:1 nach Discord gespiegelt,
 * deshalb ist Discord-Markdown erlaubt und erwuenscht (## Ueberschrift,
 * **fett**, > Zitat, - Liste). Eine einfache Vorschau zeigt, wie es
 * ungefaehr aussehen wird.
 */
export default function RulesEditor({ initialContent }: { initialContent: string }) {
  const [state, formAction, pending] = useActionState(saveRules, initialState);
  const [content, setContent] = useState(initialContent);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Formatierung</p>
        <p className="mt-1.5 text-xs text-muted">
          Discord-Markdown wird übernommen:{" "}
          <code className="rounded bg-surface-2 px-1"># Überschrift</code>{" "}
          <code className="rounded bg-surface-2 px-1">## Kleiner</code>{" "}
          <code className="rounded bg-surface-2 px-1">**fett**</code>{" "}
          <code className="rounded bg-surface-2 px-1">*kursiv*</code>{" "}
          <code className="rounded bg-surface-2 px-1">&gt; Zitat</code>{" "}
          <code className="rounded bg-surface-2 px-1">- Liste</code>
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={26}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 font-mono text-xs leading-relaxed outline-none ring-accent/40 focus:ring-2"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Wird gespeichert..." : "Speichern & in Discord aktualisieren"}
          </button>
          <span className="text-xs text-muted">{content.length} Zeichen</span>
        </div>
      </form>

      {state?.error && <p className="text-sm text-danger">❌ {state.error}</p>}
      {state?.ok && <p className="text-sm text-accent-2">✅ {state.message}</p>}
    </div>
  );
}
