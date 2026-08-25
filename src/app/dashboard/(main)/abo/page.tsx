import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import PlanChangeRequestForm from "@/components/PlanChangeRequestForm";
import PlanCard from "@/components/PlanCard";
import GraceCountdown from "@/components/GraceCountdown";
import { SUBSCRIPTION_PLANS, formatCoins } from "@/lib/constants";

export default async function AboPage() {
  const member = await requireMember();
  const pendingChange = await prisma.planChangeRequest.findFirst({
    where: { memberId: member.id, status: "PENDING" },
  });


  return (
    <div className="space-y-6">
      <div className="fade-up text-center sm:text-left">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70 sm:justify-start">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Angebote
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
          {member.subscriptionPlan ? "Abo verlängern" : "Wähle dein Paket"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Je länger die Laufzeit, desto günstiger pro Monat. Die gewählte Dauer kommt immer oben
          auf deine bestehende Laufzeit drauf.
        </p>
        <div className="mt-4 inline-flex items-center gap-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface px-6 py-4 shadow-[0_8px_30px_-12px_var(--accent)]">
          <span className="icon-badge h-12 w-12 shrink-0 text-2xl">💰</span>
          <div className="text-left">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Dein Guthaben</p>
            <p className="text-3xl font-bold tracking-tight text-accent">{formatCoins(member.balance)}</p>
          </div>
        </div>
      </div>

      {member.graceUntil && !member.feePaidUntil && (
        <div className="fade-up card border-yellow-500/40 bg-yellow-500/10 p-4">
          <p className="text-sm font-semibold text-yellow-500">⏳ Abo-Frist läuft</p>
          <p className="mt-1 text-sm text-yellow-500/90">
            Du hast die Kunden-Rolle bekommen, aber noch kein Abo. Verbleibende Zeit:{" "}
            <GraceCountdown until={member.graceUntil} />. Läuft sie ab, ohne dass ein Abo
            abgeschlossen ist, wird die Rolle automatisch wieder entzogen.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 pt-3 sm:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan, i) => {
          const proMonat = plan.price / plan.months;
          const basis = SUBSCRIPTION_PLANS[0].price / SUBSCRIPTION_PLANS[0].months;
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              balance={member.balance}
              currentPlanId={member.subscriptionPlan}
              hatAbo={Boolean(member.subscriptionPlan)}
              hervorgehoben={plan.id === SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1].id}
              ersparnis={Math.round((1 - proMonat / basis) * 100)}
            />
          );
        })}
      </div>

      <p className="fade-up text-center text-xs text-muted sm:text-left">
        Du wechselst nie dein Abo — du verlängerst es. Die gewählte Dauer wird oben auf deine
        laufende Zeit draufgerechnet, egal welches Paket du nimmst. Reicht dein Guthaben, wird der
        Betrag sofort abgebucht.
      </p>

      <div className="fade-up card space-y-3 p-5">
        <h2 className="text-sm font-semibold">So funktioniert die Bezahlung</h2>
        <p className="text-sm text-muted">
          Überweise einen beliebigen Betrag an die Business-Card{" "}
          <span className="font-mono text-foreground">BC-584289</span> mit dem Verwendungszweck{" "}
          <span className="font-mono text-foreground">Verleih {member.customerNumber ?? "-"}</span> (deine
          Kundennummer). Der Betrag wird als <span className="text-foreground">Guthaben</span> auf
          deinem Konto gutgeschrieben und bleibt dort dauerhaft hinterlegt — davon buchst du dann
          oben selbst dein Paket. Eine Rücküberweisung ist
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

      <div className="fade-up card space-y-3 p-5">
        <h2 className="text-sm font-semibold">Lieber vorher besprechen?</h2>
        {pendingChange ? (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <p className="text-sm font-medium text-accent">⏳ Antrag läuft</p>
            <p className="mt-1.5 text-sm text-muted">
              Dein Antrag auf{" "}
              <span className="text-foreground">
                {SUBSCRIPTION_PLANS.find((p) => p.id === pendingChange.requestedPlanId)?.label ??
                  pendingChange.requestedPlanId}
              </span>{" "}
              ist eingereicht. In Discord wurde dazu ein Ticket geöffnet, in dem der Owner
              bestätigt oder ablehnt.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              Reicht dein Guthaben noch nicht, oder willst du außerhalb der Business-Card zahlen?
              Dann stell hier einen Antrag — es öffnet sich automatisch ein Ticket in Discord, in
              dem ihr das gemeinsam klärt.
            </p>
            <PlanChangeRequestForm
              plans={SUBSCRIPTION_PLANS}
              currentPlanId={member.subscriptionPlan}
              balance={member.balance}
            />
          </>
        )}
      </div>

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
