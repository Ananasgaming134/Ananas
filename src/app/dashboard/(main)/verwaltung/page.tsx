import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
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
    href: "/dashboard/verwaltung/bot",
    title: "Discord-Server",
    description: "Bot-Konfiguration, Panels, Abo-Erinnerungen.",
    minRole: ROLES.OWNER,
    icon: "🤖",
  },
] as const;

export default async function VerwaltungPage() {
  const member = await requireMember(ROLES.AUFSICHT);

  const [kundenCount, activeLoans, items, recentLogs] = await Promise.all([
    prisma.member.count({ where: { role: ROLES.KUNDE, status: MEMBER_STATUS.ACTIVE } }),
    prisma.loan.count({ where: { status: LOAN_STATUS.ACTIVE } }),
    prisma.item.findMany({ select: { averagePrice: true, quantityTotal: true } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { actor: true, target: true },
    }),
  ]);
  const itemValue = items.reduce((sum, i) => sum + (i.averagePrice ?? 0) * i.quantityTotal, 0);

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Kontrollraum
        </p>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Verwaltung</h1>
        <p className="mt-1 text-sm text-muted">
          Interner Bereich für Aufsicht/Owner &ndash; nicht für Kunden sichtbar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Kunden (aktiv)" value={String(kundenCount)} icon="👥" />
        <StatCard label="Aktuell ausgeliehen" value={String(activeLoans)} accent="accent-2" icon="🔄" />
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
