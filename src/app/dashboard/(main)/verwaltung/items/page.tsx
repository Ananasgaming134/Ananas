import { Fragment } from "react";
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";
import { deleteItem, refreshItemPrices, toggleItemAvailability } from "@/app/actions/items";
import { formatCoins, PRICE_STATUS, ROLES } from "@/lib/constants";

export default async function VerwaltenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategorie?: string }>;
}) {
  await requireMember(ROLES.OWNER);
  const { q, kategorie } = await searchParams;
  const isFiltered = Boolean(q || kategorie);

  const [items, categories, totalCount] = await Promise.all([
    prisma.item.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(kategorie ? { categoryId: kategorie } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.item.count(),
  ]);
  const linkedCount = items.filter((i) => i.sourceKey).length;

  // Wie auf der Kunden-Item-Seite: immer nach Kategorie gruppiert, auch bei
  // "Alle Kategorien", statt alphabetisch/nach Erstellungsdatum durcheinander.
  const groups = new Map<string, { label: string; items: typeof items }>();
  for (const item of items) {
    const key = item.category?.id ?? "__none";
    const label = item.category?.name ?? "Ohne Kategorie";
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (a.label === "Ohne Kategorie") return 1;
    if (b.label === "Ohne Kategorie") return -1;
    return a.label.localeCompare(b.label, "de");
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items verwalten"
        description={
          <>
            Nur für Owner sichtbar.{" "}
            {isFiltered
              ? `${items.length} von ${totalCount} Items gefunden.`
              : `${totalCount} Items insgesamt.`}
          </>
        }
        action={
          <div className="flex gap-2">
            {linkedCount > 0 && (
              <form action={refreshItemPrices}>
                <button
                  type="submit"
                  className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium transition hover:bg-surface"
                >
                  Preise aktualisieren ({linkedCount})
                </button>
              </form>
            )}
            <Link
              href="/dashboard/verwaltung/items/kategorien"
              className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium transition hover:bg-surface"
            >
              Kategorien
            </Link>
            <Link
              href="/dashboard/verwaltung/items/neu"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              + Neues Item
            </Link>
          </div>
        }
      />

      {categories.length > 0 && (
        <form className="card flex flex-wrap items-center gap-3 p-4" method="GET">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Item suchen..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
          <select
            name="kategorie"
            defaultValue={kategorie ?? ""}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Suchen
          </button>
          {isFiltered && (
            <Link
              href="/dashboard/verwaltung/items"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
            >
              Zurücksetzen
            </Link>
          )}
        </form>
      )}

      {/* overflow-x-auto statt overflow-hidden: bei schmalen Fenstern war die
          Aktionen-Spalte vorher schlicht abgeschnitten und die Knoepfe
          dahinter nicht erreichbar. */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Kategorie</th>
              <th className="px-4 py-3 font-medium">Preis</th>
              <th className="px-4 py-3 font-medium">Bestand</th>
              <th className="px-4 py-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedGroups.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-surface-2/40">
                  <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-muted">
                    {group.label} ({group.items.length})
                  </td>
                </tr>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 p-1">
                          {item.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium">{item.name}</span>
                          {item.unavailable && (
                            <span className="ml-2 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                              gesperrt
                            </span>
                          )}
                          {item.unavailable && item.unavailableReason && (
                            <p className="truncate text-[11px] text-muted">{item.unavailableReason}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.category?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {item.priceStatus === PRICE_STATUS.UNAVAILABLE ? (
                        <span className="text-xs text-yellow-500">nicht verfügbar</span>
                      ) : (
                        <>
                          {formatCoins(item.averagePrice)}
                          {item.sourceKey && (
                            <span className="ml-1.5 text-[11px] text-accent-2">verknüpft</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{item.quantityTotal}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/verwaltung/items/${item.id}`}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                        >
                          Bearbeiten
                        </Link>
                        <form action={toggleItemAvailability.bind(null, item.id)}>
                          <button
                            type="submit"
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              item.unavailable
                                ? "border-accent-2/40 bg-accent-2/10 text-accent-2 hover:bg-accent-2/20"
                                : "border-border hover:bg-surface-2"
                            }`}
                          >
                            {item.unavailable ? "Freigeben" : "Sperren"}
                          </button>
                        </form>
                        <form action={deleteItem.bind(null, item.id)}>
                          <button
                            type="submit"
                            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                          >
                            Löschen
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {isFiltered ? "Keine Items gefunden." : "Noch keine Items angelegt."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
