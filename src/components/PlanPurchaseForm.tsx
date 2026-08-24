"use client";

import { useActionState } from "react";
import { purchasePlan, type PlanChangeState } from "@/app/actions/planChanges";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

const initialState: PlanChangeState = null;

/**
 * Selbstbedienung: Paket waehlen und direkt vom Guthaben abbuchen. Jeder
 * Tarif ist waehlbar - auch ein anderer als der bisherige. Reicht das
 * Guthaben nicht, kommt die Meldung direkt hier an.
 */
export default function PlanPurchaseForm({
  plans,
  currentPlanId,
  balance,
}: {
  plans: readonly SubscriptionPlan[];
  currentPlanId: string | null;
  balance: number;
}) {
  const [state, formAction, pending] = useActionState(purchasePlan, initialState);
  const affordable = plans.filter((p) => balance >= p.price);
  const defaultPlan = currentPlanId ?? affordable[affordable.length - 1]?.id ?? plans[0].id;

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <select
          name="planId"
          defaultValue={defaultPlan}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label} — {formatCoins(plan.price)}
              {plan.id === currentPlanId ? " (aktuell)" : ""}
              {balance < plan.price ? " — Guthaben reicht nicht" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gebucht..." : "Jetzt buchen"}
        </button>
      </form>

      {state?.error && <p className="text-xs text-danger">❌ {state.error}</p>}
      {state?.ok && (
        <p className="text-xs text-accent-2">
          ✅ Gebucht! Der Betrag wurde vom Guthaben abgezogen und deine Laufzeit verlängert.
        </p>
      )}
    </div>
  );
}
