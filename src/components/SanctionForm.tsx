"use client";

import { useActionState } from "react";
import { addSanction, type SanctionState } from "@/app/actions/sanctions";
import { SANCTION_REASON_PRESETS, SANCTION_TYPE_LABELS } from "@/lib/sanctions";

const initialState: SanctionState = null;

export default function SanctionForm({ memberId }: { memberId: string }) {
  const action = addSanction.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-1.5">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <select
          name="type"
          defaultValue="VERWARNUNG"
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
        >
          {Object.entries(SANCTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="reason"
          list="sanction-reasons"
          placeholder="Grund"
          required
          className="w-56 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
        />
        <datalist id="sanction-reasons">
          {SANCTION_REASON_PRESETS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "..." : "Sanktion eintragen"}
        </button>
      </form>
      {state && !state.ok && state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
