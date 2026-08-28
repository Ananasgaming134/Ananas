"use client";

import { useActionState } from "react";
import {
  blockRights,
  issueFine,
  setCustomPlan,
  grantPlan,
  type DisziplinState,
} from "@/app/actions/discipline";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

const initialState: DisziplinState = null;

const feldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2";

function Meldung({ state }: { state: DisziplinState }) {
  if (!state) return null;
  return state.ok ? (
    <p className="text-xs text-accent-2">✅ {state.hinweis}</p>
  ) : (
    <p className="text-xs text-danger">❌ {state.error}</p>
  );
}

/**
 * Sperre wegen eines Verstosses. Das Abo laeuft weiter, ausleihen geht nicht -
 * bis das Team die Sperre wieder aufhebt.
 */
export function RechteSperrenForm({ memberId }: { memberId: string }) {
  const [state, formAction, pending] = useActionState(blockRights.bind(null, memberId), initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input
        name="reason"
        required
        placeholder="Grund — die Person bekommt ihn per DM zu lesen"
        className={feldClass}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Wird gesperrt..." : "Rechte sperren"}
        </button>
        <Meldung state={state} />
      </div>
    </form>
  );
}

/** Geldstrafe, die aus dem Guthaben beglichen wird. */
export function GeldstrafeForm({ memberId, balance }: { memberId: string; balance: number }) {
  const [state, formAction, pending] = useActionState(issueFine.bind(null, memberId), initialState);

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
        <input
          name="amount"
          type="number"
          min={1}
          step={1}
          required
          placeholder="Betrag"
          className={feldClass}
        />
        <input
          name="reason"
          required
          placeholder="Grund — die Person bekommt ihn per DM zu lesen"
          className={feldClass}
        />
      </div>
      <p className="text-[11px] text-muted">
        Wird sofort vom Guthaben abgezogen ({formatCoins(balance)} vorhanden). Reicht es nicht,
        bleibt der Rest offen und wird bei der nächsten Zahlung einbehalten.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-500 transition hover:bg-yellow-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Wird verhängt..." : "Strafe verhängen"}
        </button>
        <Meldung state={state} />
      </div>
    </form>
  );
}

/** Festes Paket gewaehren, ohne Guthaben abzubuchen. */
export function AboGewaehrenForm({
  memberId,
  plans,
}: {
  memberId: string;
  plans: SubscriptionPlan[];
}) {
  const [state, formAction, pending] = useActionState(grantPlan.bind(null, memberId), initialState);

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select name="planId" defaultValue={plans[0].id} className={`${feldClass} w-auto`}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label} — {formatCoins(plan.price)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-4 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Wird gewährt..." : "Ohne Abbuchung gewähren"}
        </button>
      </div>
      <Meldung state={state} />
    </form>
  );
}

/** Freies Abo: Betrag und Laufzeit selbst festlegen. */
export function EigenesAboForm({ memberId }: { memberId: string }) {
  const [state, formAction, pending] = useActionState(
    setCustomPlan.bind(null, memberId),
    initialState
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Vom Guthaben abbuchen</span>
          <input name="amount" type="number" min={0} step={1} required defaultValue={0} className={feldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Laufzeit in Tagen</span>
          <input name="days" type="number" min={1} step={1} required placeholder="z.B. 14" className={feldClass} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ohneAbbuchung" className="h-4 w-4 accent-[var(--accent)]" />
        Nichts abbuchen (geschenkt)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Wird gesetzt..." : "Abo setzen"}
        </button>
        <Meldung state={state} />
      </div>
      <p className="text-[11px] text-muted">
        Die Laufzeit kommt oben auf eine noch laufende Zeit drauf. Die Sechs-Monats-Grenze gilt
        auch hier.
      </p>
    </form>
  );
}
