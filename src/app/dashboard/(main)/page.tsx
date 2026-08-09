import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import LoanCountdown from "@/components/LoanCountdown";
import { formatCoins, getSubscriptionPlan, LOAN_STATUS } from "@/lib/constants";

const QUICK_LINKS = [
  { href: "/dashboard/items", icon: "📦", label: "Items", text: "Verfügbare Items durchstöbern" },
  { href: "/dashboard/anleitung", icon: "📖", label: "Anleitung", text: "Ablauf & Zeitregeln" },
  { href: "/dashboard/hilfe", icon: "💬", label: "Hilfe", text: "FAQ & Support" },
  { href: "/dashboard/akte", icon: "👤", label: "Profil", text: "Abo, Historie & mehr" },
];

export default async function DashboardPage() {
  const member = await requireMember();

  const [myActiveLoans, myLoans] = await Promise.all([
    prisma.loan.findMany({
      where: { memberId: member.id, status: LOAN_STATUS.ACTIVE },
      include: { item: true },
      orderBy: { borrowedAt: "desc" },
    }),
    prisma.loan.findMany({
      where: { memberId: member.id },
      include: { item: true },
    }),
  ]);

  const frequency = new Map<string, { name: string; count: number }>();
  for (const loan of myLoans) {
    const entry = frequency.get(loan.itemId) ?? { name: loan.item.name, count: 0 };
    entry.count += 1;
    frequency.set(loan.itemId, entry);
  }
  const topItems = Array.from(frequency.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const isSuspended = Boolean(member.borrowSuspendedUntil && member.borrowSuspendedUntil > new Date());
  const currentPlan = getSubscriptionPlan(member.subscriptionPlan);
  const isExpired = member.feePaidUntil ? member.feePaidUntil < new Date() : true;

  return (
    <div className="space-y-8">
      <div className="card-glass relative overflow-hidden p-6 sm:p-8">
        <div className="shimmer pointer-events-none absolute inset-0" />
        <h1 className="relative text-2xl font-semibold">
          Willkommen zurück, <span className="text-gradient">{member.displayName}</span>
        </h1>
        <p className="relative mt-2 text-sm text-muted">
          Kundennummer {member.customerNumber ?? "-"} &middot; Monatliche Gebühr{" "}
          {formatCoins(member.monthlyFee)}
        </p>
      </div>

      {isSuspended && (
        <div className="card border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">🚫 Ausleih-Sperre aktiv</p>
          <p className="mt-1 text-sm text-danger/90">
            {member.borrowSuspendedReason ?? "Du bist aktuell für das Ausleihen gesperrt."} Gesperrt
            bis{" "}
            {member.borrowSuspendedUntil?.toLocaleString("de-DE", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card card-hover flex items-center gap-3 p-4"
          >
            <span className="text-2xl">{link.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{link.label}</p>
              <p className="truncate text-xs text-muted">{link.text}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ausleihen insgesamt" value={String(myLoans.length)} />
        <StatCard
          label="Aktuell ausgeliehen"
          value={String(myActiveLoans.length)}
          accent="accent-2"
        />
        <StatCard
          label="Lieblings-Item"
          value={topItems[0]?.name ?? "-"}
          hint={topItems[0] ? `${topItems[0].count}x ausgeliehen` : "noch keine Ausleihen"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Deine aktuell ausgeliehenen Items</h2>
            <Link href="/dashboard/items" className="text-xs text-accent hover:underline">
              Zu den Items
            </Link>
          </div>
          {myActiveLoans.length === 0 ? (
            <p className="text-sm text-muted">Du hast aktuell nichts ausgeliehen.</p>
          ) : (
            <ul className="divide-y divide-border">
              {myActiveLoans.map((loan) => (
                <li key={loan.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{loan.item.name}</span>
                  {loan.dueAt ? (
                    <LoanCountdown dueAt={loan.dueAt} className="text-xs" />
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            Insgesamt {myLoans.length} Ausleihe(n) in deiner Historie.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Deine meistgeliehenen Items</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <ul className="space-y-2.5">
              {topItems.map((item, i) => (
                <li key={item.name} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs text-muted">
                    {i + 1}
                  </span>
                  <span className="flex-1">{item.name}</span>
                  <span className="text-xs text-muted">{item.count}x</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className={`card border-l-4 p-5 ${
          currentPlan ? (isExpired ? "border-l-danger" : "border-l-accent-2") : "border-l-border"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Dein Abo</h2>
              {currentPlan && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    isExpired
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  }`}
                >
                  {isExpired ? "Abgelaufen" : "Aktiv"}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {currentPlan
                ? `${currentPlan.label} · ${formatCoins(currentPlan.price)}${
                    member.feePaidUntil
                      ? ` · gültig bis ${member.feePaidUntil.toLocaleDateString("de-DE")}`
                      : ""
                  }`
                : "Noch kein Abo zugewiesen."}
            </p>
          </div>
          <Link
            href="/dashboard/akte"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Abo verwalten
          </Link>
        </div>
      </div>
    </div>
  );
}
