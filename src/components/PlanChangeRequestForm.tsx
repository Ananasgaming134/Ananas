"use client";

import { useActionState } from "react";
import { requestPlanChange, type PlanChangeState } from "@/app/actions/planChanges";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

const initialState: PlanChangeState = null;

export default function PlanChangeRequestForm({
  plans,
  currentPlanId,
  balance,
}: {
  plans: readonly SubscriptionPlan[];
  currentPlanId: string | null;
  balance: number;
}) {
  const [state, formAction, pending] = useActionState(requestPlanChange, initialState);
  const defaultPlan = plans.find((p) => p.id !== currentPlanId);

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <select
          name="requestedPlanId"
          defaultValue={defaultPlan?.id}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
        >
          {plans.map((plan) => {
            const affordable = balance >= plan.price;
            return (
              <option key={plan.id} value={plan.id} disabled={plan.id === currentPlanId}>
                {plan.label} — {formatCoins(plan.price)}
                {plan.id === currentPlanId ? " (aktuell)" : affordable ? "" : " — Guthaben reicht nicht"}
              </option>
            );
          })}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gesendet..." : "Wechsel beantragen"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.ok && (
        <p className="text-xs text-accent-2">
          ✅ Anfrage eingereicht &ndash; der Owner schaut sie sich an.
        </p>
      )}
    </div>
  );
}
