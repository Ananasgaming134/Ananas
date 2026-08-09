import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import { formatCoins, hasAtLeastRole, LOAN_STATUS, MEMBER_STATUS, ROLES } from "@/lib/constants";

const SECTIONS = [
  {
    href: "/dashboard/verwaltung/kunden",
    title: "Kunden",
    description: "Alle Kunden mit Abo-Status, Suche und Übersicht.",
    minRole: ROLES.AUFSICHT,
  },
  {
    href: "/dashboard/verwaltung/mitglieder",
    title: "Mitglieder-Archiv",
    description: "Dauerhaftes Archiv aller Mitglieder, auch nach Ausschluss.",
    minRole: ROLES.AUFSICHT,
  },
  {
    href: "/dashboard/verwaltung/logs",
    title: "Logs",
    description: "Lückenloses Audit-Log jeder Aktion im System.",
    minRole: ROLES.AUFSICHT,
  },
  {
    href: "/dashboard/verwaltung/zahlungen",
    title: "Zahlungen",
    description: "Erkannte Business-Card-Überweisungen bestätigen oder ignorieren.",
    minRole: ROLES.AUFSICHT,
  },
  {
    href: "/dashboard/verwaltung/items",
    title: "Items",
    description: "Items anlegen/bearbeiten, Preise, Kategorien verwalten.",
    minRole: ROLES.OWNER,
  },
  {
    href: "/dashboard/verwaltung/bot",
    title: "Discord-Server",
    description: "Bot-Konfiguration, Panels, Abo-Erinnerungen.",
    minRole: ROLES.OWNER,
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
      <div>
        <h1 className="text-xl font-semibold">Verwaltung</h1>
        <p className="mt-1 text-sm text-muted">
          Interner Bereich für Aufsicht/Owner &ndash; nicht für Kunden sichtbar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Kunden (aktiv)" value={String(kundenCount)} />
        <StatCard label="Aktuell ausgeliehen" value={String(activeLoans)} accent="accent-2" />
        <StatCard label="Gesamtwert Items" value={formatCoins(itemValue)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((s) => hasAtLeastRole(member.role, s.minRole)).map((s) => (
          <Link key={s.href} href={s.href} className="card card-hover flex flex-col gap-1.5 p-5">
            <h2 className="text-sm font-semibold">{s.title}</h2>
            <p className="text-xs text-muted">{s.description}</p>
          </Link>
        ))}
      </div>

      <div className="card p-5">
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
