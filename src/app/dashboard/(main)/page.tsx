import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import ElapsedTime from "@/components/ElapsedTime";
import { formatCoins, LOAN_STATUS } from "@/lib/constants";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Willkommen, {member.displayName}</h1>
        <p className="mt-1 text-sm text-muted">
          Monatliche Gebühr: {formatCoins(member.monthlyFee)}
        </p>
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
            <Link href="/dashboard/akte" className="text-xs text-accent hover:underline">
              Profil ansehen
            </Link>
          </div>
          {myActiveLoans.length === 0 ? (
            <p className="text-sm text-muted">Du hast aktuell nichts ausgeliehen.</p>
          ) : (
            <ul className="divide-y divide-border">
              {myActiveLoans.map((loan) => (
                <li key={loan.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{loan.item.name}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-2/30 bg-accent-2/10 px-2 py-0.5 text-xs text-accent-2">
                    <ElapsedTime since={loan.borrowedAt} />
                  </span>
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
    </div>
  );
}
