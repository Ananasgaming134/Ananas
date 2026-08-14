"use client";

import { useActionState } from "react";
import { adjustBalance, type AdjustBalanceState } from "@/app/actions/members";

const initialState: AdjustBalanceState = null;

export default function BalanceAdjustForm({ memberId }: { memberId: string }) {
  const action = adjustBalance.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-1.5">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          name="amount"
          placeholder="Betrag (z.B. -500000)"
          required
          className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
        />
        <input
          type="text"
          name="reason"
          placeholder="Grund"
          className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "..." : "Guthaben buchen"}
        </button>
      </form>
      {state && !state.ok && state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
