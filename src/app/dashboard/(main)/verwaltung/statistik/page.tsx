import { requireMember } from "@/lib/session";
import StatCard from "@/components/StatCard";
import StatBar from "@/components/StatBar";
import PageHeader from "@/components/PageHeader";
import { getGeneralStats } from "@/lib/stats";
import { getReviewSummary, renderStars } from "@/lib/reviews";
import { ROLES } from "@/lib/constants";

export default async function StatistikPage() {
  await requireMember(ROLES.AUFSICHT);

  const [stats, reviewSummary] = await Promise.all([getGeneralStats(), getReviewSummary()]);

  const maxItemCount = stats.topItems[0]?.count ?? 0;
  const maxCategoryCount = stats.topCategories[0]?.count ?? 0;
  const maxMemberCount = stats.topMembers[0]?.count ?? 0;
  const maxChannelCount = Math.max(stats.webLoans, stats.discordLoans, 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistik"
        description="Auswertung aller Ausleihen – was wird am meisten genutzt, wer leiht am meisten aus."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Ausleihen insgesamt" value={String(stats.totalLoans)} icon="📦" />
        <StatCard label="Aktuell ausgeliehen" value={String(stats.activeLoans)} accent="accent-2" icon="🔄" />
        <StatCard label="Überfällig" value={String(stats.overdueLoans)} accent="danger" icon="⏰" />
        <StatCard
          label="Ø Bewertung"
          value={reviewSummary.count > 0 ? `${reviewSummary.average.toFixed(1)}/5` : "–"}
          hint={
            reviewSummary.count > 0
              ? `${renderStars(Math.round(reviewSummary.average))} · ${reviewSummary.count} Bewertungen`
              : "noch keine Bewertungen"
          }
          icon="⭐"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">🏆 Meistgeliehene Items</h2>
          {stats.topItems.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {stats.topItems.map((item) => (
                <StatBar
                  key={item.name}
                  label={item.name}
                  sublabel={item.sublabel}
                  count={item.count}
                  max={maxItemCount}
                />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{stats.itemCount} Item(s) im Bestand.</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">📂 Meistgeliehene Kategorien</h2>
          {stats.topCategories.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {stats.topCategories.map((cat) => (
                <StatBar key={cat.name} label={cat.name} count={cat.count} max={maxCategoryCount} accent="accent-2" />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{stats.categoryCount} Kategorie(n) insgesamt angelegt.</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">⭐ Aktivste Kunden</h2>
          {stats.topMembers.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {stats.topMembers.map((m, i) => (
                <div key={m.name + i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs text-muted">
                    {i + 1}
                  </span>
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt={m.name}
                      className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px]">
                      {m.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <StatBar label={m.name} count={m.count} max={maxMemberCount} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{stats.memberCount} Kunde(n) insgesamt.</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">📡 Ausleihen nach Kanal</h2>
          <div className="space-y-4">
            <StatBar label="🌐 Website" count={stats.webLoans} max={maxChannelCount} />
            <StatBar label="🤖 Discord" count={stats.discordLoans} max={maxChannelCount} accent="accent-2" />
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
