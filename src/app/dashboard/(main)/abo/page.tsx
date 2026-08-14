import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requestPlanChange } from "@/app/actions/planChanges";
import { SUBSCRIPTION_PLANS, formatCoins } from "@/lib/constants";

export default async function AboPage() {
  const member = await requireMember();
  const pendingChange = await prisma.planChangeRequest.findFirst({
    where: { memberId: member.id, status: "PENDING" },
  });

  const INCLUDED_FEATURES = [
    "Zugriff auf den kompletten Item-Bestand",
    "Ausleihen sowohl über die Website als auch direkt in Discord",
    "Automatische Zahlungs-Zuordnung per Verwendungszweck",
    "Pausieren jederzeit über ein Support-Ticket möglich",
  ];

  return (
    <div className="space-y-6">
      <div className="fade-up text-center sm:text-left">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70 sm:justify-start">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Angebote
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Wähle dein Paket</h1>
        <p className="mt-2 text-sm text-muted">
          Je länger die Laufzeit, desto günstiger pro Monat — jederzeit wechselbar.
        </p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent">
          <span aria-hidden>💰</span>
          Dein Guthaben: {formatCoins(member.balance)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan, i) => {
          const monthlyRate = plan.price / plan.months;
          const baseMonthlyRate = SUBSCRIPTION_PLANS[0].price / SUBSCRIPTION_PLANS[0].months;
          const savingsPct = Math.round((1 - monthlyRate / baseMonthlyRate) * 100);
          const isBestValue = plan.id === SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1].id;
          const isCurrent = member.subscriptionPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`fade-up fade-up-${i + 1} card-hover relative overflow-hidden rounded-2xl border p-6 ${
                isBestValue
                  ? "border-accent/60 bg-gradient-to-b from-accent/10 via-surface to-surface shadow-[0_0_40px_-12px_var(--accent)]"
                  : "border-border bg-surface"
              }`}
            >
              {isBestValue && <div className="gradient-top-bar" />}
              {isBestValue && (
                <span className="absolute -top-2.5 right-5 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-black shadow-md">
                  ⭐ Beliebt
                </span>
              )}
              {isCurrent && (
                <span className="mb-2 inline-block rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-0.5 text-[10px] font-medium text-accent-2">
                  ✓ Dein aktuelles Paket
                </span>
              )}
              <p className="text-base font-semibold">{plan.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-accent">{formatCoins(plan.price)}</p>
              <p className="mt-1 text-xs text-muted">
                {formatCoins(Math.round(monthlyRate))} / Monat
                {savingsPct > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent-2/15 px-1.5 py-0.5 font-medium text-accent-2">
                    -{savingsPct}%
                  </span>
                )}
              </p>
              <ul className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted">
                {INCLUDED_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent-2">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="fade-up card space-y-3 p-5">
        <h2 className="text-sm font-semibold">So funktioniert die Bezahlung</h2>
        <p className="text-sm text-muted">
          Überweise einen beliebigen Betrag an die Business-Card{" "}
          <span className="font-mono text-foreground">BC-584289</span> mit dem Verwendungszweck{" "}
          <span className="font-mono text-foreground">Verleih {member.customerNumber ?? "-"}</span> (deine
          Kundennummer). Der Betrag wird als <span className="text-foreground">Guthaben</span> auf
          deinem Konto gutgeschrieben und bleibt dort dauerhaft hinterlegt — die Aufsicht bucht
          davon dein gewünschtes Paket ab, sobald genug Guthaben da ist. Eine Rücküberweisung ist
          nicht möglich; Guthaben verfällt nur bei einem Ausschluss wegen Regelverstoß.
        </p>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-accent">💡 Tipp: Dauerauftrag einrichten</p>
          <p className="mt-1.5 text-xs text-muted">
            Richtest du dir einen Dauerauftrag mit genau diesem Verwendungszweck ein, wächst dein
            Guthaben automatisch weiter, ohne dass du selbst jedes Mal daran denken musst.
            Bevorzugst du es lieber persönlich zu regeln, eröffne stattdessen ein{" "}
            <Link href="/dashboard/tickets" className="text-accent hover:underline">
              Support-Ticket
            </Link>{" "}
            — die Aufsicht kümmert sich dann direkt mit dir darum.
          </p>
        </div>
        <p className="text-xs text-muted">
          Dein aktuelles Guthaben und die Verwaltung deines laufenden Abos findest du auf deiner{" "}
          <Link href="/dashboard/akte" className="text-accent hover:underline">
            Profilseite
          </Link>
          .
        </p>
      </div>

      {member.subscriptionPlan && (
        <div className="fade-up card space-y-3 p-5">
          <h2 className="text-sm font-semibold">Paket wechseln</h2>
          {pendingChange ? (
            <p className="text-sm text-muted">
              Anfrage auf{" "}
              <span className="text-foreground">
                {SUBSCRIPTION_PLANS.find((p) => p.id === pendingChange.requestedPlanId)?.label ?? pendingChange.requestedPlanId}
              </span>{" "}
              ist eingereicht und wartet auf Genehmigung durch den Owner.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Möchtest du ein anderes Paket? Der Wechsel muss vom Owner genehmigt werden und gilt
                dann ab deiner nächsten Verlängerung — deine aktuelle Laufzeit bleibt unangetastet.
              </p>
              <form action={requestPlanChange} className="flex flex-wrap items-center gap-2">
                <select
                  name="requestedPlanId"
                  defaultValue={SUBSCRIPTION_PLANS.find((p) => p.id !== member.subscriptionPlan)?.id}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
                >
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <option key={plan.id} value={plan.id} disabled={plan.id === member.subscriptionPlan}>
                      {plan.label} {plan.id === member.subscriptionPlan ? "(aktuell)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
                >
                  Wechsel beantragen
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <div className="fade-up card space-y-2 p-5 text-sm">
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
