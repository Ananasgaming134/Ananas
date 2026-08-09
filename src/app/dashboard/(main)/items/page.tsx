import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { borrowItem, returnLoan } from "@/app/actions/loans";
import LoanCountdown from "@/components/LoanCountdown";
import { hasAtLeastRole, LOAN_STATUS, ROLES } from "@/lib/constants";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategorie?: string }>;
}) {
  const member = await requireMember();
  const isOwner = hasAtLeastRole(member.role, ROLES.OWNER);
  const { q, kategorie } = await searchParams;

  const [items, activeLoans, myActiveLoans, categories, totalCount] = await Promise.all([
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
      orderBy: { name: "asc" },
      include: { category: true },
    }),
    prisma.loan.groupBy({
      by: ["itemId"],
      where: { status: LOAN_STATUS.ACTIVE },
      _count: { itemId: true },
    }),
    prisma.loan.findMany({
      where: { memberId: member.id, status: LOAN_STATUS.ACTIVE },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.item.count(),
  ]);

  const activeCountByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));
  const myLoanByItem = new Map(myActiveLoans.map((l) => [l.itemId, l]));
  const isFiltered = Boolean(q || kategorie);
  const isSuspended = Boolean(member.borrowSuspendedUntil && member.borrowSuspendedUntil > new Date());

  // Items werden immer nach Kategorie gruppiert dargestellt - auch bei
  // "Alle Kategorien" - statt alphabetisch quer durcheinander, damit man sich
  // im Bestand zurechtfindet. "Ohne Kategorie" steht dabei immer zuletzt.
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Items</h1>
          <p className="mt-1 text-sm text-muted">
            {isFiltered
              ? `${items.length} von ${totalCount} Item-Arten gefunden.`
              : `${totalCount} Item-Arten im LeihCenter-Bestand.`}
          </p>
        </div>
        {isOwner && (
          <Link
            href="/dashboard/verwaltung/items"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Items verwalten
          </Link>
        )}
      </div>

      {isSuspended && (
        <div className="card border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">🚫 Ausleih-Sperre aktiv</p>
          <p className="mt-1 text-sm text-danger/90">
            {member.borrowSuspendedReason ?? "Du bist aktuell für das Ausleihen gesperrt."}
            {" "}Gesperrt bis{" "}
            {member.borrowSuspendedUntil?.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}.
          </p>
        </div>
      )}

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
              href="/dashboard/items"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
            >
              Zurücksetzen
            </Link>
          )}
        </form>
      )}

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {isFiltered
            ? "Keine Items gefunden."
            : "Es sind noch keine Items hinterlegt."}
          {!isFiltered && isOwner && " Lege das erste Item unter „Items verwalten“ an."}
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map((group) => (
            <div key={group.label} className="space-y-4">
              <h2 className="text-sm font-semibold text-muted">
                {group.label}
                <span className="ml-2 text-xs font-normal text-muted/60">
                  ({group.items.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const borrowedCount = activeCountByItem.get(item.id) ?? 0;
                  const available = item.quantityTotal - borrowedCount;
                  const myLoan = myLoanByItem.get(item.id);

                  return (
                    <div key={item.id} className="card flex flex-col overflow-hidden">
                      <div className="aspect-video w-full bg-surface-2">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                            Kein Bild
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold">{item.name}</h3>
                          <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                            {available > 0 ? `${available}/${item.quantityTotal} frei` : "verliehen"}
                          </span>
                        </div>

                        <div className="mt-auto pt-4">
                          {myLoan ? (
                            <>
                              <p className="mb-2 text-center text-xs">
                                {myLoan.dueAt ? (
                                  <LoanCountdown dueAt={myLoan.dueAt} />
                                ) : (
                                  <span className="text-muted">Ausgeliehen</span>
                                )}
                              </p>
                              <form action={returnLoan.bind(null, myLoan.id)}>
                                <button
                                  type="submit"
                                  className="w-full rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20"
                                >
                                  Zurückgeben
                                </button>
                              </form>
                            </>
                          ) : isSuspended ? (
                            <button
                              type="button"
                              disabled
                              className="w-full cursor-not-allowed rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                            >
                              Gesperrt
                            </button>
                          ) : available > 0 ? (
                            <form action={borrowItem.bind(null, item.id)}>
                              <button
                                type="submit"
                                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                              >
                                Ausleihen
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted"
                            >
                              Nicht verfügbar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
