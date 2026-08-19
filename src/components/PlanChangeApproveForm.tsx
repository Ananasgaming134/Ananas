"use client";

import { useActionState } from "react";
import { approvePlanChange, type PlanChangeState } from "@/app/actions/planChanges";

const initialState: PlanChangeState = null;

/**
 * Genehmigen-Button mit Fehleranzeige - schlaegt fehl, wenn das Guthaben des
 * Kunden nicht fuer das gewuenschte Paket reicht (siehe approvePlanChangeCore).
 */
export default function PlanChangeApproveForm({ requestId }: { requestId: string }) {
  const action = approvePlanChange.bind(null, requestId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "..." : "Genehmigen"}
        </button>
      </form>
      {state?.error && <p className="max-w-xs text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
