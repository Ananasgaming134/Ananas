import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { applyPaymentToPlan, checkPayments, ignorePayment } from "@/app/actions/payments";
import { ROLES, SUBSCRIPTION_PLANS } from "@/lib/constants";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ausstehend",
  APPLIED: "Übernommen",
  IGNORED: "Ignoriert",
};

export default async function ZahlungenPage() {
  await requireMember(ROLES.AUFSICHT);

  const [pending, recent] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PENDING" },
      include: { member: true },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { status: { not: "PENDING" } },
      include: { member: true },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Zahlungen</h1>
          <p className="mt-1 text-sm text-muted">
            Eingehende Business-Card-Überweisungen (BC-584289), automatisch per Discord-Username
            zugeordnet. Die Bestätigung zu einem Abo-Plan bleibt manuell &ndash; die Business-Card-
            Währung (₵) hat eine andere Skala als unsere Abo-Preise.
          </p>
        </div>
        <form action={checkPayments}>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Zahlungen jetzt prüfen
          </button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Eingang</th>
              <th className="px-4 py-3 font-medium">Betrag</th>
              <th className="px-4 py-3 font-medium">Von</th>
              <th className="px-4 py-3 font-medium">Grund</th>
              <th className="px-4 py-3 font-medium">Mitglied</th>
              <th className="px-4 py-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pending.map((payment) => (
              <tr key={payment.id}>
                <td className="px-4 py-3 text-muted">
                  {payment.receivedAt.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3 font-medium text-accent">{payment.amount} ₵</td>
                <td className="px-4 py-3">@{payment.discordUsername}</td>
                <td className="px-4 py-3 text-muted">{payment.reason ?? "-"}</td>
                <td className="px-4 py-3">
                  {payment.member ? (
                    <Link href={`/dashboard/akte/${payment.member.id}`} className="hover:underline">
                      {payment.member.displayName}
                    </Link>
                  ) : (
                    <span className="text-xs text-yellow-500">kein Mitglied gefunden</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {payment.member && (
                      <form action={applyPaymentToPlan.bind(null, payment.id)} className="flex items-center gap-1.5">
                        <select
                          name="planId"
                          defaultValue={SUBSCRIPTION_PLANS[0].id}
                          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
                        >
                          {SUBSCRIPTION_PLANS.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-accent-2/40 bg-accent-2/10 px-2.5 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                        >
                          Bestätigen
                        </button>
                      </form>
                    )}
                    <form action={ignorePayment.bind(null, payment.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2"
                      >
                        Ignorieren
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Keine ausstehenden Zahlungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {recent.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold">Zuletzt bearbeitet</h2>
          <ul className="space-y-2 text-sm">
            {recent.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">
                  {payment.receivedAt.toLocaleDateString("de-DE")} &middot; {payment.amount} ₵ von @
                  {payment.discordUsername}
                  {payment.member && ` (${payment.member.displayName})`}
                </span>
                <span
                  className={
                    payment.status === "APPLIED" ? "text-accent-2" : "text-muted"
                  }
                >
                  {STATUS_LABELS[payment.status] ?? payment.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
