import Link from "next/link";
import { requireMember } from "@/lib/session";
import { SUBSCRIPTION_PLANS, formatCoins } from "@/lib/constants";

export default async function AboPage() {
  const member = await requireMember();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const monthlyRate = plan.price / plan.months;
          const baseMonthlyRate = SUBSCRIPTION_PLANS[0].price / SUBSCRIPTION_PLANS[0].months;
          const savingsPct = Math.round((1 - monthlyRate / baseMonthlyRate) * 100);
          const isBestValue = plan.id === SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1].id;
          const isCurrent = member.subscriptionPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`card-hover relative rounded-xl border p-5 ${
                isBestValue ? "border-accent/50 bg-accent/5" : "border-border bg-surface"
              }`}
            >
              {isBestValue && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-black">
                  Beliebt
                </span>
              )}
              {isCurrent && (
                <span className="mb-2 inline-block rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-0.5 text-[10px] font-medium text-accent-2">
                  Dein aktuelles Paket
                </span>
              )}
              <p className="text-base font-semibold">{plan.label}</p>
              <p className="mt-2 text-2xl font-semibold text-accent">{formatCoins(plan.price)}</p>
              <p className="mt-1 text-xs text-muted">
                {formatCoins(Math.round(monthlyRate))} / Monat
                {savingsPct > 0 && <span className="ml-1.5 text-accent-2">-{savingsPct}%</span>}
              </p>
            </div>
          );
        })}
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">So funktioniert die Bezahlung</h2>
        <p className="text-sm text-muted">
          Überweise den Betrag für die gewünschte Laufzeit an die Business-Card{" "}
          <span className="font-mono text-foreground">BC-584289</span> mit dem Verwendungszweck{" "}
          <span className="font-mono text-foreground">Verleih {member.customerNumber ?? "-"}</span> (deine
          Kundennummer) — die Zahlung wird dadurch automatisch erkannt und deinem Konto zugeordnet.
        </p>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-accent">💡 Tipp: Dauerauftrag einrichten</p>
          <p className="mt-1.5 text-xs text-muted">
            Richtest du dir einen Dauerauftrag mit genau diesem Verwendungszweck ein, wird jede
            Zahlung automatisch erkannt und deinem Konto zugeordnet — dein Abo läuft dann durch,
            ohne dass du selbst jedes Mal daran denken musst. Bevorzugst du es lieber persönlich zu
            regeln, eröffne stattdessen ein{" "}
            <Link href="/dashboard/tickets" className="text-accent hover:underline">
              Support-Ticket
            </Link>{" "}
            — die Aufsicht kümmert sich dann direkt mit dir darum.
          </p>
        </div>
        <p className="text-xs text-muted">
          Verwaltung deines laufenden Abos (Laufzeit, Verlängern) findest du auf deiner{" "}
          <Link href="/dashboard/akte" className="text-accent hover:underline">
            Profilseite
          </Link>
          .
        </p>
      </div>

      <div className="card space-y-2 p-5 text-sm">
        <h2 className="text-sm font-semibold">Abo pausieren</h2>
        <p className="text-muted">
          Du brauchst mal eine Pause? Über ein{" "}
          <Link href="/dashboard/tickets" className="text-accent hover:underline">
            Support-Ticket
          </Link>{" "}
          kann die Aufsicht dein Abo für einen bestimmten Zeitraum pausieren — du zahlst dann für
          diese Zeit nicht und kannst nichts ausleihen, verlierst aber auch nichts: die pausierte
          Zeit wird beim Fortsetzen automatisch an deine Laufzeit drangehängt. Ein Verstoß gegen die
          allgemeinen Regeln kann dagegen zum sofortigen, entschädigungslosen Ausschluss führen.
        </p>
      </div>
    </div>
  );
}
