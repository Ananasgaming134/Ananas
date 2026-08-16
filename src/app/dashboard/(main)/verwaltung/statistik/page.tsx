import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import { LOAN_CHANNEL, LOAN_STATUS, ROLES } from "@/lib/constants";

function Bar({
  label,
  sublabel,
  count,
  max,
  accent = "accent",
}: {
  label: string;
  sublabel?: string;
  count: number;
  max: number;
  accent?: "accent" | "accent-2";
}) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  const barColor = accent === "accent" ? "bg-accent" : "bg-accent-2";
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          {sublabel && <p className="truncate text-xs text-muted">{sublabel}</p>}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted">{count}x</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function StatistikPage() {
  await requireMember(ROLES.AUFSICHT);

  const [loans, itemCount, categoryCount, memberCount] = await Promise.all([
    prisma.loan.findMany({
      include: { item: { include: { category: true } }, member: true },
    }),
    prisma.item.count(),
    prisma.category.count(),
    prisma.member.count({ where: { role: ROLES.KUNDE } }),
  ]);

  const totalLoans = loans.length;
  const activeLoans = loans.filter((l) => l.status === LOAN_STATUS.ACTIVE).length;
  const overdueLoans = loans.filter((l) => l.status === LOAN_STATUS.OVERDUE).length;
  const webLoans = loans.filter((l) => l.channel === LOAN_CHANNEL.WEB).length;
  const discordLoans = loans.filter((l) => l.channel === LOAN_CHANNEL.DISCORD).length;

  const itemStats = new Map<string, { name: string; category: string; count: number }>();
  const categoryStats = new Map<string, { name: string; count: number }>();
  const memberStats = new Map<string, { name: string; avatarUrl: string | null; count: number }>();

  for (const loan of loans) {
    const itemEntry = itemStats.get(loan.itemId) ?? {
      name: loan.item.name,
      category: loan.item.category?.name ?? "Ohne Kategorie",
      count: 0,
    };
    itemEntry.count += 1;
    itemStats.set(loan.itemId, itemEntry);

    const categoryKey = loan.item.category?.id ?? "none";
    const categoryEntry = categoryStats.get(categoryKey) ?? {
      name: loan.item.category?.name ?? "Ohne Kategorie",
      count: 0,
    };
    categoryEntry.count += 1;
    categoryStats.set(categoryKey, categoryEntry);

    const memberEntry = memberStats.get(loan.memberId) ?? {
      name: loan.member.displayName,
      avatarUrl: loan.member.avatarUrl,
      count: 0,
    };
    memberEntry.count += 1;
    memberStats.set(loan.memberId, memberEntry);
  }

  const topItems = [...itemStats.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const topCategories = [...categoryStats.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const topMembers = [...memberStats.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const maxItemCount = topItems[0]?.count ?? 0;
  const maxCategoryCount = topCategories[0]?.count ?? 0;
  const maxMemberCount = topMembers[0]?.count ?? 0;
  const maxChannelCount = Math.max(webLoans, discordLoans, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Statistik</h1>
        <p className="mt-1 text-sm text-muted">
          Auswertung aller Ausleihen &ndash; was wird am meisten genutzt, wer leiht am meisten aus.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Ausleihen insgesamt" value={String(totalLoans)} icon="📦" />
        <StatCard label="Aktuell ausgeliehen" value={String(activeLoans)} accent="accent-2" icon="🔄" />
        <StatCard label="Überfällig" value={String(overdueLoans)} accent="danger" icon="⏰" />
        <StatCard label="Items im Bestand" value={String(itemCount)} icon="🗂️" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">🏆 Meistgeliehene Items</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {topItems.map((item) => (
                <Bar
                  key={item.name}
                  label={item.name}
                  sublabel={item.category}
                  count={item.count}
                  max={maxItemCount}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">📂 Meistgeliehene Kategorien</h2>
          {topCategories.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {topCategories.map((cat) => (
                <Bar key={cat.name} label={cat.name} count={cat.count} max={maxCategoryCount} accent="accent-2" />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{categoryCount} Kategorie(n) insgesamt angelegt.</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">⭐ Aktivste Kunden</h2>
          {topMembers.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {topMembers.map((m, i) => (
                <div key={m.name + i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs text-muted">
                    {i + 1}
                  </span>
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt={m.name} className="h-7 w-7 shrink-0 rounded-full border border-border object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px]">
                      {m.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <p className="truncate font-medium">{m.name}</p>
                      <span className="shrink-0 font-mono text-xs text-muted">{m.count}x</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(4, Math.round((m.count / maxMemberCount) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{memberCount} Kunde(n) insgesamt.</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">📡 Ausleihen nach Kanal</h2>
          <div className="space-y-4">
            <Bar label="🌐 Website" count={webLoans} max={maxChannelCount} />
            <Bar label="🤖 Discord" count={discordLoans} max={maxChannelCount} accent="accent-2" />
          </div>
          <p className="mt-4 text-xs text-muted">
            Zeigt, worüber Kunden am liebsten ausleihen &ndash; hilfreich um zu sehen, ob das
            Discord-Panel gut genutzt wird.
          </p>
        </div>
      </div>
    </div>
  );
}
