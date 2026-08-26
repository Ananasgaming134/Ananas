import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import ItemCard from "@/components/ItemCard";
import { hasAtLeastRole, LOAN_STATUS, REBORROW_COOLDOWN_MS, ROLES } from "@/lib/constants";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategorie?: string }>;
}) {
  const member = await requireMember();
  const isOwner = hasAtLeastRole(member.role, ROLES.OWNER);
  const { q, kategorie } = await searchParams;
  const now = new Date();

  const [items, activeLoans, myActiveLoans, myRecentReturns, categories, totalCount, favorites] =
    await Promise.all([
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
    prisma.loan.findMany({
      where: {
        memberId: member.id,
        status: LOAN_STATUS.RETURNED,
        returnedAt: { gte: new Date(now.getTime() - REBORROW_COOLDOWN_MS) },
      },
      orderBy: { returnedAt: "desc" },
      select: { itemId: true, returnedAt: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.item.count(),
    prisma.favorite.findMany({ where: { memberId: member.id }, select: { itemId: true } }),
    ]);

  const activeCountByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));
  const myLoanByItem = new Map(myActiveLoans.map((l) => [l.itemId, l]));
  // Cooldown-Ende pro Item nach eigener Rueckgabe - nur der juengste Return
  // pro Item zaehlt (myRecentReturns ist bereits nach returnedAt absteigend
  // sortiert, deshalb wird bei einem Duplikat der erste/neueste behalten).
  const cooldownEndByItem = new Map<string, Date>();
  for (const loan of myRecentReturns) {
    if (!loan.returnedAt || cooldownEndByItem.has(loan.itemId)) continue;
    cooldownEndByItem.set(loan.itemId, new Date(loan.returnedAt.getTime() + REBORROW_COOLDOWN_MS));
  }
  // Gesamt-Verfuegbarkeit ueber die gerade angezeigten Items (Stueckzahlen,
  // nicht Item-Arten) - das ist die Zahl, die man beim Ausleihen wirklich braucht.
  const totalUnits = items.reduce((sum, i) => sum + i.quantityTotal, 0);
  const freeUnits = items.reduce(
    (sum, i) => sum + Math.max(0, i.quantityTotal - (activeCountByItem.get(i.id) ?? 0)),
    0
  );
  const favoritIds = new Set(favorites.map((f) => f.itemId));
  const isFiltered = Boolean(q || kategorie);
  const isSuspended = Boolean(member.borrowSuspendedUntil && member.borrowSuspendedUntil > now);
  const isPaused = Boolean(member.pausedAt);
  const hasNoActiveSubscription = !member.pausedAt && (!member.feePaidUntil || member.feePaidUntil < now);

  const sperren = {
    gesperrt: isSuspended,
    pausiert: isPaused,
    ohneAbo: hasNoActiveSubscription,
    unverifiziert: !member.verifiedAt,
  };

  const lageFuer = (item: (typeof items)[number]) => ({
    available: item.quantityTotal - (activeCountByItem.get(item.id) ?? 0),
    myLoan: myLoanByItem.get(item.id) ?? null,
    cooldownEnd: cooldownEndByItem.get(item.id) ?? null,
    favorit: favoritIds.has(item.id),
  });

  // Items werden immer nach Kategorie gruppiert dargestellt - auch bei
  // "Alle Kategorien" - statt alphabetisch quer durcheinander, damit man sich
  // im Bestand zurechtfindet. "Ohne Kategorie" steht dabei immer zuletzt.
  // Favoriten stehen als eigener Block ganz oben und werden deshalb aus den
  // Kategorien herausgenommen - sonst stuende dieselbe Kachel zweimal auf der
  // Seite. Bei aktiver Suche entfaellt der Block: dann sucht man gezielt und
  // will das Ergebnis am Stueck sehen.
  const favoritenItems = isFiltered ? [] : items.filter((i) => favoritIds.has(i.id));
  const uebrigeItems = favoritenItems.length > 0 ? items.filter((i) => !favoritIds.has(i.id)) : items;

  const groups = new Map<string, { label: string; items: typeof items }>();
  for (const item of uebrigeItems) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">
            {isFiltered
              ? `${items.length} von ${totalCount} Item-Arten gefunden.`
              : `${totalCount} Item-Arten im LeihCenter-Bestand.`}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              freeUnits === 0
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-accent-2/40 bg-accent-2/10 text-accent-2"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${freeUnits === 0 ? "bg-danger" : "bg-accent-2"}`}
              aria-hidden
            />
            {freeUnits} von {totalUnits} Stück sofort verfügbar
          </span>
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

      {!member.verifiedAt && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-yellow-500/40 bg-yellow-500/10 p-4">
          <div>
            <p className="text-sm font-semibold text-yellow-500">⚠️ Minecraft-Account noch nicht verifiziert</p>
            <p className="mt-1 text-sm text-yellow-500/90">
              Bevor du etwas ausleihen kannst, musst du einmalig deinen Minecraft-Namen bestätigen.
            </p>
          </div>
          <Link
            href="/dashboard/akte"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Jetzt verifizieren
          </Link>
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
          {favoritenItems.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                  <span aria-hidden>★</span>
                  Deine Favoriten
                  <span className="text-xs font-normal text-muted/60">
                    ({favoritenItems.length})
                  </span>
                </h2>
                <span className="text-xs text-muted">
                  Mit dem Stern an der Kachel merkst du dir Items — sie stehen dann hier oben.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {favoritenItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    lage={lageFuer(item)}
                    sperren={sperren}
                    zeigeKategorie
                  />
                ))}
              </div>
            </div>
          )}

          {sortedGroups.map((group) => {
            const groupTotal = group.items.reduce((sum, i) => sum + i.quantityTotal, 0);
            const groupFree = group.items.reduce(
              (sum, i) => sum + Math.max(0, i.quantityTotal - (activeCountByItem.get(i.id) ?? 0)),
              0
            );
            return (
            <div key={group.label} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-muted">
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-muted/60">
                    ({group.items.length})
                  </span>
                </h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    groupFree === 0
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  }`}
                >
                  {groupFree} von {groupTotal} Stück frei
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <ItemCard key={item.id} item={item} lage={lageFuer(item)} sperren={sperren} />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
