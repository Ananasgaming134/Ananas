import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";

const PAGE_SIZE = 50;

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ seite?: string }>;
}) {
  await requireMember(ROLES.AUFSICHT);
  const { seite } = await searchParams;
  const page = Math.max(1, parseInt(seite ?? "1", 10) || 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { actor: true, target: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit-Log</h1>
        <p className="mt-1 text-sm text-muted">
          Vollständiges Protokoll aller Bearbeitungen im LeihCenter ({total} Einträge).
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Zeitpunkt</th>
              <th className="px-4 py-3 font-medium">Aktion</th>
              <th className="px-4 py-3 font-medium">Ausgeführt von</th>
              <th className="px-4 py-3 font-medium">Betrifft</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {log.createdAt.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-3">
                  {log.actor ? (
                    <Link href={`/dashboard/akte/${log.actor.id}`} className="hover:underline">
                      {log.actor.displayName}
                    </Link>
                  ) : (
                    <span className="text-muted">System</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {log.target ? (
                    <Link href={`/dashboard/akte/${log.target.id}`} className="hover:underline">
                      {log.target.displayName}
                    </Link>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{log.details ?? "-"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Noch keine Log-Einträge vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Seite {page} von {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/verwaltung/logs?seite=${page - 1}`}
                className="rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2"
              >
                Zurück
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/dashboard/verwaltung/logs?seite=${page + 1}`}
                className="rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2"
              >
                Weiter
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
