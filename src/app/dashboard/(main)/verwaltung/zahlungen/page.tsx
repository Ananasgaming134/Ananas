import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";
import { checkPayments, creditPaymentToBalance, ignorePayment } from "@/app/actions/payments";
import { isRefundEligible } from "@/lib/subscriptions";
import { MEMBER_STATUS, ROLES } from "@/lib/constants";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ausstehend",
  APPLIED: "Übernommen",
  DONATED: "Spende",
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
      <PageHeader
        title="Zahlungen"
        description={
          <>
            Eingehende Business-Card-Überweisungen (BC-584289), automatisch per Discord-Username
            zugeordnet. Gutschreiben legt den Betrag als Guthaben (1 ₵ = 1 $) auf dem Konto an
            &ndash; das Abbuchen eines Pakets passiert separat auf der Akte-Seite. Nur aktive
            Kunden können Guthaben aufladen; Zahlungen von Mitgliedern ohne aktiven Status zählen
            automatisch als Spende.
          </>
        }
        action={
          <form action={checkPayments}>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Zahlungen jetzt prüfen
            </button>
          </form>
        }
      />

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
                    <div>
                      <Link href={`/dashboard/akte/${payment.member.id}`} className="hover:underline">
                        {payment.member.displayName}
                      </Link>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                        💰 ${payment.member.balance.toLocaleString("en-US")}
                      </span>
                      {payment.member.status !== MEMBER_STATUS.ACTIVE && (
                        <p className="mt-0.5 text-[11px] text-yellow-500">
                          🎁 Kein aktiver Kunde — zählt als Spende, kein Guthaben
                        </p>
                      )}
                      {payment.member.lockedAt && (
                        <p className={`mt-0.5 text-[11px] ${isRefundEligible(payment.member) ? "text-danger" : "text-muted"}`}>
                          {isRefundEligible(payment.member)
                            ? "⚠️ Abo gesperrt, zu kurzfristig gewarnt — Rückerstattung fällig"
                            : "Abo gesperrt — zählt als Spende, keine Rückerstattung"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-yellow-500">kein Mitglied gefunden</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {payment.member && (
                      <form action={creditPaymentToBalance.bind(null, payment.id)}>
                        <button
                          type="submit"
                          className="rounded-md border border-accent-2/40 bg-accent-2/10 px-2.5 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                        >
                          💰 Gutschreiben
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
