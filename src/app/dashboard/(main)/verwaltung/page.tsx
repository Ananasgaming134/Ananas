import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import { forceReturnLoan } from "@/app/actions/loans";
import { formatCoins, hasAtLeastRole, LOAN_STATUS, MEMBER_STATUS, ROLES } from "@/lib/constants";

const SECTIONS = [
  {
    href: "/dashboard/verwaltung/bewerbungen",
    title: "Bewerbungen",
    description: "Kunden-Bewerbungen prüfen, rote Liste, Paketwechsel genehmigen.",
    minRole: ROLES.OWNER,
    icon: "📝",
  },
  {
    href: "/dashboard/verwaltung/tickets",
    title: "Tickets",
    description: "Offene Support- und Bewerbungs-Tickets claimen/schließen.",
    minRole: ROLES.AUFSICHT,
    icon: "🎫",
  },
  {
    href: "/dashboard/verwaltung/kunden",
    title: "Kunden",
    description: "Alle Kunden mit Abo-Status, Suche und Übersicht.",
    minRole: ROLES.AUFSICHT,
    icon: "👥",
  },
  {
    href: "/dashboard/verwaltung/mitglieder",
    title: "Mitglieder-Archiv",
    description: "Dauerhaftes Archiv aller Mitglieder, auch nach Ausschluss.",
    minRole: ROLES.AUFSICHT,
    icon: "🗂️",
  },
  {
    href: "/dashboard/verwaltung/logs",
    title: "Logs",
    description: "Lückenloses Audit-Log jeder Aktion im System.",
    minRole: ROLES.AUFSICHT,
    icon: "📜",
  },
  {
    href: "/dashboard/verwaltung/zahlungen",
    title: "Zahlungen",
    description: "Erkannte Business-Card-Überweisungen bestätigen oder ignorieren.",
    minRole: ROLES.AUFSICHT,
    icon: "💳",
  },
  {
    href: "/dashboard/verwaltung/items",
    title: "Items",
    description: "Items anlegen/bearbeiten, Preise, Kategorien verwalten.",
    minRole: ROLES.OWNER,
    icon: "📦",
  },
  {
    href: "/dashboard/verwaltung/statistik",
    title: "Statistik",
    description: "Meistgeliehene Items/Kategorien, aktivste Kunden, Kanal-Nutzung.",
    minRole: ROLES.AUFSICHT,
    icon: "📊",
  },
  {
    href: "/dashboard/verwaltung/bot",
    title: "Discord-Server",
    description: "Bot-Konfiguration, Panels, Abo-Erinnerungen.",
    minRole: ROLES.OWNER,
    icon: "🤖",
  },
] as const;

export default async function VerwaltungPage() {
  const member = await requireMember(ROLES.AUFSICHT);

  const [kundenCount, openLoans, items, recentLogs, openTickets, pendingPayments] = await Promise.all([
    prisma.member.count({ where: { role: ROLES.KUNDE, status: MEMBER_STATUS.ACTIVE } }),
    prisma.loan.findMany({
      where: { status: LOAN_STATUS.ACTIVE },
      include: { item: true, member: true },
      orderBy: { borrowedAt: "asc" },
    }),
    prisma.item.findMany({ select: { averagePrice: true, quantityTotal: true } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { actor: true, target: true },
    }),
    prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);
  const itemValue = items.reduce((sum, i) => sum + (i.averagePrice ?? 0) * i.quantityTotal, 0);
  const now = new Date();
  const overdueLoans = openLoans.filter((l) => l.dueAt && l.dueAt < now);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kontrollraum"
        title="Verwaltung"
        description="Interner Bereich für Aufsicht/Owner – nicht für Kunden sichtbar."
      />

      {(openTickets > 0 || pendingPayments > 0 || overdueLoans.length > 0) && (
        <div className="fade-up flex flex-wrap gap-2">
          {overdueLoans.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
              ⏰ {overdueLoans.length} überfällige Ausleihe(n)
            </span>
          )}
          {openTickets > 0 && (
            <Link
              href="/dashboard/verwaltung/tickets"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
            >
              🎫 {openTickets} offene(s) Ticket(s)
            </Link>
          )}
          {pendingPayments > 0 && (
            <Link
              href="/dashboard/verwaltung/zahlungen"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
            >
              💰 {pendingPayments} unbearbeitete Zahlung(en)
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Kunden (aktiv)" value={String(kundenCount)} icon="👥" />
        <StatCard label="Aktuell ausgeliehen" value={String(openLoans.length)} accent="accent-2" icon="🔄" />
        <StatCard label="Gesamtwert Items" value={formatCoins(itemValue)} icon="💰" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((s) => hasAtLeastRole(member.role, s.minRole)).map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={`fade-up fade-up-${Math.min(i + 1, 6)} card card-hover flex items-start gap-3 p-5`}
          >
            <span className="icon-badge h-10 w-10 shrink-0 text-lg">{s.icon}</span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{s.title}</h2>
              <p className="mt-0.5 text-xs text-muted">{s.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="fade-up card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Aktuell ausgeliehen</h2>
          <span className="text-xs text-muted">{openLoans.length} aktive Ausleihe(n)</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Hat jemand ein Item abgegeben, aber vergessen es zurückzugeben? Hier kannst du es für die
          Person ausbuchen.
        </p>
        {openLoans.length === 0 ? (
          <p className="text-sm text-muted">Aktuell ist nichts ausgeliehen.</p>
        ) : (
          <ul className="divide-y divide-border">
            {openLoans.map((loan) => {
              const overdue = Boolean(loan.dueAt && loan.dueAt < now);
              return (
                <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{loan.item.name}</span>{" "}
                      <span className="text-muted">&middot;</span>{" "}
                      <Link href={`/dashboard/akte/${loan.memberId}`} className="text-accent hover:underline">
                        {loan.member.displayName}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-xs">
                      {loan.dueAt ? (
                        <span className={overdue ? "text-danger" : "text-muted"}>
                          {overdue ? "⏰ Überfällig seit " : "Fällig um "}
                          {loan.dueAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-muted">ohne Frist</span>
                      )}
                    </p>
                  </div>
                  <form action={forceReturnLoan.bind(null, loan.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 hover:text-accent"
                    >
                      ↩ Ausbuchen
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="fade-up card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Letzte Aktivitäten</h2>
          <Link href="/dashboard/verwaltung/logs" className="text-xs text-accent hover:underline">
            Alle Logs ansehen
          </Link>
        </div>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Einträge vorhanden.</p>
        ) : (
          <ul className="space-y-2">
            {recentLogs.map((log) => (
              <li key={log.id} className="text-sm">
                <span className="text-muted">{log.createdAt.toLocaleString("de-DE")}</span>{" "}
                &middot; <span className="font-medium">{log.action}</span>
                {log.details && <span className="text-muted"> &ndash; {log.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
