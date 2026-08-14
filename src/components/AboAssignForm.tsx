"use client";

import { useActionState } from "react";
import { setSubscriptionPlan, type AssignPlanState } from "@/app/actions/members";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

const initialState: AssignPlanState = null;

export default function AboAssignForm({
  memberId,
  plans,
  currentPlanId,
}: {
  memberId: string;
  plans: SubscriptionPlan[];
  currentPlanId?: string;
}) {
  const action = setSubscriptionPlan.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={formAction} className="flex items-center gap-2">
        <select
          name="planId"
          defaultValue={currentPlanId ?? plans[0].id}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label} &ndash; {formatCoins(plan.price)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gebucht..." : "Vom Guthaben abbuchen"}
        </button>
      </form>
      {state && !state.ok && state.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
