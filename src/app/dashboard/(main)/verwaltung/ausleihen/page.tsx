import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { forceReturnLoan } from "@/app/actions/loans";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import LoanCountdown from "@/components/LoanCountdown";
import { LOAN_STATUS, OVERDUE_SUSPENSION_GRACE_MS, ROLES } from "@/lib/constants";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Laufende Ausleihen auf einen Blick: wer hat was, wann laeuft die Frist ab
 * und wer hat sie schon gerissen. Ueberzogene Ausleihen stehen oben, damit
 * man beim Reinkommen zuerst sieht, wo Handlungsbedarf besteht.
 */
export default async function AusleihenPage() {
  await requireMember(ROLES.AUFSICHT);

  const now = new Date();
  const loans = await prisma.loan.findMany({
    where: { status: LOAN_STATUS.ACTIVE },
    include: {
      item: { select: { name: true, imageUrl: true } },
      member: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          minecraftName: true,
          borrowSuspendedUntil: true,
        },
      },
    },
  });

  const rows = loans
    .map((loan) => {
      const remaining = loan.dueAt ? loan.dueAt.getTime() - now.getTime() : null;
      const overdue = remaining !== null && remaining <= 0;
      const suspended = overdue && remaining !== null && remaining <= -OVERDUE_SUSPENSION_GRACE_MS;
      const soon = remaining !== null && remaining > 0 && remaining <= 30 * 60_000;
      return { loan, remaining, overdue, suspended, soon };
    })
    // Ueberzogene zuerst, danach die knappsten Fristen.
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.remaining ?? Infinity) - (b.remaining ?? Infinity);
    });

  const overdueCount = rows.filter((r) => r.overdue).length;
  const soonCount = rows.filter((r) => r.soon).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Derzeit ausgeliehen"
        description="Alle laufenden Ausleihen mit Frist und Restzeit. Überzogene stehen oben. Wer überzieht, wird zusätzlich im Discord-Kanal für Überziehungen gemeldet."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Aktive Ausleihen" value={String(rows.length)} icon="🔄" accent="accent-2" />
        <StatCard
          label="Bald fällig"
          value={String(soonCount)}
          hint="in den nächsten 30 Minuten"
          icon="⏳"
        />
        <StatCard
          label="Überzogen"
          value={String(overdueCount)}
          hint={overdueCount > 0 ? "Frist bereits gerissen" : "alles im Zeitplan"}
          icon="⏰"
          accent="danger"
        />
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          Aktuell ist nichts ausgeliehen.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {rows.map(({ loan, overdue, suspended, soon }) => (
            <div
              key={loan.id}
              className={`flex flex-wrap items-center gap-4 p-4 ${
                overdue ? "bg-danger/5" : ""
              }`}
            >
              {/* Farbstreifen links: Zustand ist so auch beim Ueberfliegen erkennbar. */}
              <span
                aria-hidden
                className={`h-10 w-1 shrink-0 rounded-full ${
                  overdue ? "bg-danger" : soon ? "bg-yellow-500" : "bg-accent-2/60"
                }`}
              />

              <div className="flex min-w-0 flex-1 items-center gap-3">
                {loan.member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loan.member.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-border"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs">
                    {loan.member.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{loan.item.name}</p>
                  <p className="truncate text-xs text-muted">
                    <Link
                      href={`/dashboard/akte/${loan.member.id}`}
                      className="text-accent hover:underline"
                    >
                      {loan.member.displayName}
                    </Link>
                    {loan.member.minecraftName && (
                      <>
                        {" · "}
                        <span className="font-mono">{loan.member.minecraftName}</span>
                      </>
                    )}
                    {" · über "}
                    {loan.channel === "DISCORD" ? "Discord" : "Website"}
                  </p>
                </div>
              </div>

              <div className="w-40 shrink-0 text-xs">
                <p className="text-muted">
                  Seit {formatTime(loan.borrowedAt)}
                  {loan.dueAt && ` · bis ${formatTime(loan.dueAt)}`}
                </p>
                {loan.dueAt ? (
                  <LoanCountdown dueAt={loan.dueAt} className="mt-0.5 block font-medium" />
                ) : (
                  <span className="mt-0.5 block text-muted">ohne Frist</span>
                )}
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  suspended
                    ? "border-danger/50 bg-danger/15 text-danger"
                    : overdue
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : soon
                        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
                        : "border-accent-2/30 bg-accent-2/10 text-accent-2"
                }`}
              >
                {suspended ? "gesperrt" : overdue ? "überzogen" : soon ? "bald fällig" : "läuft"}
              </span>

              <form action={forceReturnLoan.bind(null, loan.id)} className="shrink-0">
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 hover:text-accent"
                >
                  ↩ Ausbuchen
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
