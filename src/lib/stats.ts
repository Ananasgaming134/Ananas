import { prisma } from "@/lib/prisma";
import { LOAN_CHANNEL, LOAN_STATUS, MEMBER_STATUS, ROLES } from "@/lib/constants";

/** Kennzahlen fuer die oeffentliche Startseite (ohne Login sichtbar). */
export async function getPublicStats() {
  const [items, activeMembers, kunden, activeLoans] = await Promise.all([
    prisma.item.findMany({ select: { averagePrice: true, quantityTotal: true } }),
    prisma.member.count({ where: { status: MEMBER_STATUS.ACTIVE } }),
    prisma.member.count({ where: { status: MEMBER_STATUS.ACTIVE, role: ROLES.KUNDE } }),
    prisma.loan.count({ where: { status: LOAN_STATUS.ACTIVE } }),
  ]);

  const totalValue = items.reduce(
    (sum, item) => sum + (item.averagePrice ?? 0) * item.quantityTotal,
    0
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantityTotal, 0);

  return {
    totalValue,
    itemCount: items.length,
    totalQuantity,
    activeMembers,
    kundenCount: kunden,
    activeLoans,
  };
}

export type RankedEntry = { name: string; sublabel?: string; count: number };

export type GeneralStats = {
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  itemCount: number;
  categoryCount: number;
  memberCount: number;
  webLoans: number;
  discordLoans: number;
  topItems: RankedEntry[];
  topCategories: RankedEntry[];
  topMembers: (RankedEntry & { avatarUrl: string | null })[];
};

/**
 * Allgemeine Auswertung ueber ALLE Ausleihen - Grundlage sowohl fuer die
 * Statistik-Seiten auf der Website als auch fuer den "/statistik"-Befehl im
 * Discord, damit beide dieselben Zahlen zeigen.
 */
export async function getGeneralStats(): Promise<GeneralStats> {
  const [loans, itemCount, categoryCount, memberCount] = await Promise.all([
    prisma.loan.findMany({ include: { item: { include: { category: true } }, member: true } }),
    prisma.item.count(),
    prisma.category.count(),
    prisma.member.count({ where: { role: ROLES.KUNDE } }),
  ]);

  const itemStats = new Map<string, RankedEntry>();
  const categoryStats = new Map<string, RankedEntry>();
  const memberStats = new Map<string, RankedEntry & { avatarUrl: string | null }>();

  for (const loan of loans) {
    const categoryName = loan.item.category?.name ?? "Ohne Kategorie";

    const item = itemStats.get(loan.itemId) ?? { name: loan.item.name, sublabel: categoryName, count: 0 };
    item.count += 1;
    itemStats.set(loan.itemId, item);

    const categoryKey = loan.item.category?.id ?? "none";
    const category = categoryStats.get(categoryKey) ?? { name: categoryName, count: 0 };
    category.count += 1;
    categoryStats.set(categoryKey, category);

    const member = memberStats.get(loan.memberId) ?? {
      name: loan.member.displayName,
      avatarUrl: loan.member.avatarUrl,
      count: 0,
    };
    member.count += 1;
    memberStats.set(loan.memberId, member);
  }

  const byCount = (a: RankedEntry, b: RankedEntry) => b.count - a.count;

  return {
    totalLoans: loans.length,
    activeLoans: loans.filter((l) => l.status === LOAN_STATUS.ACTIVE).length,
    overdueLoans: loans.filter((l) => l.status === LOAN_STATUS.OVERDUE).length,
    itemCount,
    categoryCount,
    memberCount,
    webLoans: loans.filter((l) => l.channel === LOAN_CHANNEL.WEB).length,
    discordLoans: loans.filter((l) => l.channel === LOAN_CHANNEL.DISCORD).length,
    topItems: [...itemStats.values()].sort(byCount).slice(0, 8),
    topCategories: [...categoryStats.values()].sort(byCount).slice(0, 8),
    topMembers: [...memberStats.values()].sort(byCount).slice(0, 6),
  };
}

export type PersonalStats = {
  totalLoans: number;
  activeLoans: number;
  topItems: RankedEntry[];
  topCategories: RankedEntry[];
  firstLoanAt: Date | null;
  lastLoanAt: Date | null;
};

/** Dieselbe Auswertung, aber nur fuer die Ausleihen einer einzelnen Person. */
export async function getPersonalStats(memberId: string): Promise<PersonalStats> {
  const loans = await prisma.loan.findMany({
    where: { memberId },
    include: { item: { include: { category: true } } },
    orderBy: { borrowedAt: "asc" },
  });

  const itemStats = new Map<string, RankedEntry>();
  const categoryStats = new Map<string, RankedEntry>();

  for (const loan of loans) {
    const categoryName = loan.item.category?.name ?? "Ohne Kategorie";

    const item = itemStats.get(loan.itemId) ?? { name: loan.item.name, sublabel: categoryName, count: 0 };
    item.count += 1;
    itemStats.set(loan.itemId, item);

    const categoryKey = loan.item.category?.id ?? "none";
    const category = categoryStats.get(categoryKey) ?? { name: categoryName, count: 0 };
    category.count += 1;
    categoryStats.set(categoryKey, category);
  }

  const byCount = (a: RankedEntry, b: RankedEntry) => b.count - a.count;

  return {
    totalLoans: loans.length,
    activeLoans: loans.filter((l) => l.status === LOAN_STATUS.ACTIVE).length,
    topItems: [...itemStats.values()].sort(byCount).slice(0, 5),
    topCategories: [...categoryStats.values()].sort(byCount).slice(0, 5),
    firstLoanAt: loans[0]?.borrowedAt ?? null,
    lastLoanAt: loans[loans.length - 1]?.borrowedAt ?? null,
  };
}

/** Kleine Text-Balken fuer Discord-Embeds (dort gibt es kein CSS). */
export function textBar(count: number, max: number, width = 12): string {
  if (max <= 0) return "";
  const filled = Math.max(1, Math.round((count / max) * width));
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function rankedToLines(entries: RankedEntry[]): string {
  if (entries.length === 0) return "_Noch keine Ausleihen._";
  const max = entries[0].count;
  return entries
    .map((e, i) => `\`${String(i + 1).padStart(2)}.\` ${textBar(e.count, max)} **${e.name}** — ${e.count}x`)
    .join("\n");
}
