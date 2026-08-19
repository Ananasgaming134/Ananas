import { requireMember } from "@/lib/session";
import StatCard from "@/components/StatCard";
import StatBar from "@/components/StatBar";
import { getGeneralStats, getPersonalStats } from "@/lib/stats";

export default async function KundenStatistikPage() {
  const member = await requireMember();
  const [general, personal] = await Promise.all([getGeneralStats(), getPersonalStats(member.id)]);

  const maxOwnItem = personal.topItems[0]?.count ?? 0;
  const maxOwnCategory = personal.topCategories[0]?.count ?? 0;
  const maxItem = general.topItems[0]?.count ?? 0;
  const maxCategory = general.topCategories[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <p className="fade-up text-sm text-muted">
        Deine eigenen Ausleihen &ndash; und was im LeihCenter insgesamt am gefragtesten ist.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Deine Ausleihen" value={String(personal.totalLoans)} icon="📦" />
        <StatCard
          label="Aktuell bei dir"
          value={String(personal.activeLoans)}
          accent="accent-2"
          icon="🔄"
        />
        <StatCard label="Items im Bestand" value={String(general.itemCount)} icon="🗂️" />
        <StatCard label="Ausleihen aller" value={String(general.totalLoans)} icon="🌍" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="fade-up card p-5">
          <h2 className="mb-4 text-sm font-semibold">⭐ Deine Lieblings-Items</h2>
          {personal.topItems.length === 0 ? (
            <p className="text-sm text-muted">Du hast noch nichts ausgeliehen.</p>
          ) : (
            <div className="space-y-4">
              {personal.topItems.map((item) => (
                <StatBar
                  key={item.name}
                  label={item.name}
                  sublabel={item.sublabel}
                  count={item.count}
                  max={maxOwnItem}
                />
              ))}
            </div>
          )}
          {personal.firstLoanAt && (
            <p className="mt-4 text-xs text-muted">
              Erste Ausleihe am {personal.firstLoanAt.toLocaleDateString("de-DE")}
              {personal.lastLoanAt &&
                ` · zuletzt am ${personal.lastLoanAt.toLocaleDateString("de-DE")}`}
              .
            </p>
          )}
        </div>

        <div className="fade-up fade-up-1 card p-5">
          <h2 className="mb-4 text-sm font-semibold">📂 Deine Lieblings-Kategorien</h2>
          {personal.topCategories.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {personal.topCategories.map((cat) => (
                <StatBar
                  key={cat.name}
                  label={cat.name}
                  count={cat.count}
                  max={maxOwnCategory}
                  accent="accent-2"
                />
              ))}
            </div>
          )}
        </div>

        <div className="fade-up fade-up-2 card p-5">
          <h2 className="mb-4 text-sm font-semibold">🔥 Die gefragtesten Items</h2>
          {general.topItems.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {general.topItems.map((item) => (
                <StatBar
                  key={item.name}
                  label={item.name}
                  sublabel={item.sublabel}
                  count={item.count}
                  max={maxItem}
                />
              ))}
            </div>
          )}
        </div>

        <div className="fade-up fade-up-3 card p-5">
          <h2 className="mb-4 text-sm font-semibold">🏷️ Die gefragtesten Kategorien</h2>
          {general.topCategories.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
          ) : (
            <div className="space-y-4">
              {general.topCategories.map((cat) => (
                <StatBar
                  key={cat.name}
                  label={cat.name}
                  count={cat.count}
                  max={maxCategory}
                  accent="accent-2"
                />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            Aus {general.totalLoans} Ausleihen von {general.memberCount} Kunden insgesamt.
          </p>
        </div>
      </div>
    </div>
  );
}
