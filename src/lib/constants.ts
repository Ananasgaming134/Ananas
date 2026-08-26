export const ROLES = {
  KUNDE: "KUNDE",
  AUFSICHT: "AUFSICHT",
  OWNER: "OWNER",
} as const;
export type RoleValue = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<RoleValue, string> = {
  KUNDE: "Kunde",
  AUFSICHT: "Aufsichtsperson",
  OWNER: "Owner",
};

// Rangfolge für Berechtigungsprüfungen (höher = mehr Rechte)
export const ROLE_RANK: Record<RoleValue, number> = {
  KUNDE: 0,
  AUFSICHT: 1,
  OWNER: 2,
};

export function hasAtLeastRole(role: string | undefined | null, min: RoleValue): boolean {
  if (!role || !(role in ROLE_RANK)) return false;
  return ROLE_RANK[role as RoleValue] >= ROLE_RANK[min];
}

/** Verhindert, dass jemand Kollegen auf gleicher oder höherer Stufe verwaltet. */
export function canManage(actorRole: string, targetRole: string): boolean {
  if (!(actorRole in ROLE_RANK) || !(targetRole in ROLE_RANK)) return false;
  return ROLE_RANK[actorRole as RoleValue] > ROLE_RANK[targetRole as RoleValue];
}

export const MEMBER_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  BANNED: "BANNED",
} as const;
export type MemberStatusValue = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

export const MEMBER_STATUS_LABELS: Record<MemberStatusValue, string> = {
  ACTIVE: "Aktiv",
  REVOKED: "Freigabe entzogen",
  BANNED: "Ausgeschlossen",
};

export const LOAN_STATUS = {
  ACTIVE: "ACTIVE",
  RETURNED: "RETURNED",
  OVERDUE: "OVERDUE",
} as const;
export type LoanStatusValue = (typeof LOAN_STATUS)[keyof typeof LOAN_STATUS];

export const LOAN_STATUS_LABELS: Record<LoanStatusValue, string> = {
  ACTIVE: "Ausgeliehen",
  RETURNED: "Zurückgegeben",
  OVERDUE: "Überfällig",
};

// Ausleih-Zeitregeln (siehe src/lib/loans.ts fuer die eigentliche Durchsetzung).
export const BORROW_DURATION_MS = 2 * 60 * 60 * 1000; // 2 Stunden pro Ausleihe
export const REBORROW_COOLDOWN_MS = 30 * 60 * 1000; // 30 Min. Pause vor erneuter Ausleihe desselben Items
export const OVERDUE_SUSPENSION_GRACE_MS = 15 * 60 * 1000; // Kulanzfrist nach Ablauf, bevor die Sperre greift
/**
 * Wie lange jemand nach einer Ueberziehung nicht ausleihen darf - gestaffelt
 * nach der tatsaechlich ueberzogenen Zeit. Wer nur ein paar Minuten drueber
 * ist, soll nicht genauso hart getroffen werden wie jemand, der ein Item
 * einen halben Tag behaelt.
 *
 * Die Staffel greift zweimal: sobald die Kulanzfrist reisst, vorlaeufig
 * anhand der bis dahin ueberzogenen Zeit - und bei der Rueckgabe noch einmal
 * neu, anhand der wirklich ueberzogenen Zeit, dann ab dem Moment der
 * Rueckgabe. Sonst koennte man sich der Sperre entziehen, indem man das Item
 * einfach behaelt.
 */
export const SUSPENSION_STEPS: { bisMs: number; sperreMs: number }[] = [
  { bisMs: 1 * 60 * 60 * 1000, sperreMs: 3 * 60 * 60 * 1000 },
  { bisMs: 2 * 60 * 60 * 1000, sperreMs: 6 * 60 * 60 * 1000 },
  { bisMs: 3 * 60 * 60 * 1000, sperreMs: 12 * 60 * 60 * 1000 },
];
export const SUSPENSION_MAX_MS = 24 * 60 * 60 * 1000;

/** Sperrdauer fuer eine bestimmte Ueberziehung. Innerhalb der Kulanz: keine. */
export function suspensionForOverdue(overdueMs: number): number {
  if (overdueMs <= OVERDUE_SUSPENSION_GRACE_MS) return 0;
  for (const stufe of SUSPENSION_STEPS) {
    if (overdueMs <= stufe.bisMs) return stufe.sperreMs;
  }
  return SUSPENSION_MAX_MS;
}

/** "3 Stunden", "45 Minuten" - fuer Meldungen an die Betroffenen. */
export function formatDuration(ms: number): string {
  const minuten = Math.round(ms / 60000);
  if (minuten < 60) return `${minuten} Minute${minuten === 1 ? "" : "n"}`;
  const stunden = Math.round((minuten / 60) * 10) / 10;
  const anzeige = Number.isInteger(stunden) ? String(stunden) : stunden.toLocaleString("de-DE");
  return `${anzeige} Stunde${stunden === 1 ? "" : "n"}`;
}

export const LOAN_REMINDER_STAGE = {
  NONE: "NONE",
  THIRTY: "THIRTY",
  FIVE: "FIVE",
  OVERDUE: "OVERDUE",
  SUSPENDED: "SUSPENDED",
} as const;
export type LoanReminderStageValue = (typeof LOAN_REMINDER_STAGE)[keyof typeof LOAN_REMINDER_STAGE];

// Wortkettenspiel: fester Kanal + Regelparameter (siehe src/lib/wordChain.ts).
export const WORTKETTEN_CHANNEL_ID = process.env.DISCORD_WORTKETTEN_CHANNEL_ID ?? "";
export const WORD_CHAIN_REUSE_GAP = 5; // Mind. so viele andere Woerter muessen dazwischen liegen

export const LOAN_CHANNEL = {
  WEB: "WEB",
  DISCORD: "DISCORD",
} as const;
export type LoanChannelValue = (typeof LOAN_CHANNEL)[keyof typeof LOAN_CHANNEL];

export const PRICE_STATUS = {
  OK: "OK",
  UNAVAILABLE: "UNAVAILABLE",
  MANUAL: "MANUAL",
} as const;
export type PriceStatusValue = (typeof PRICE_STATUS)[keyof typeof PRICE_STATUS];

export const SITE_NAME = "OP-LeihCenter";
/** Oeffentliche Adresse der Website - fuer Links in Discord-Nachrichten und DMs. */
export const SITE_URL = "https://op-leihcenter.de";
export const SERVER_NAME = "OPSucht";
export const SERVER_URL = "https://opsucht.net";
// Der eigene Discord-Server des LeihCenters (Firma), NICHT der offizielle
// OPSucht-Server. Dort werden die Rollen Kunde LeihCenter / Aufsichtsperson /
// Owner vergeben, die für den Login hier geprüft werden.
export const AUTH_DISCORD_SERVER_NAME = "OP - LeihCenter";
export const MONTHLY_FEE_DEFAULT = 5_000_000;
export const PRICE_SOURCE_URL =
  process.env.PRICE_SOURCE_URL || "https://btc-clan.xyz/op-items";

export function formatCoins(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  return "$" + new Intl.NumberFormat("en-US").format(amount);
}

export type SubscriptionPlan = {
  id: string;
  months: number;
  price: number;
  label: string;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: "1_MONTH", months: 1, price: 5_000_000, label: "1 Monat" },
  { id: "3_MONTHS", months: 3, price: 12_500_000, label: "3 Monate" },
  { id: "6_MONTHS", months: 6, price: 22_500_000, label: "6 Monate" },
];

export function getSubscriptionPlan(id: string | null | undefined): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id) ?? null;
}
