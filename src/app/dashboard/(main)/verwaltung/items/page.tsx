import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteItem, refreshItemPrices } from "@/app/actions/items";
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
        ...(q ? { name: { contains: q } } : {}),
        ...(kategorie ? { categoryId: kategorie } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.item.count(),
  ]);
  const linkedCount = items.filter((i) => i.sourceKey).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Items verwalten</h1>
          <p className="mt-1 text-sm text-muted">
            Nur für Owner sichtbar.{" "}
            {isFiltered
              ? `${items.length} von ${totalCount} Items gefunden.`
              : `${totalCount} Items insgesamt.`}
          </p>
        </div>
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
      </div>

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

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
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
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
                      {item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="font-medium">{item.name}</span>
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
