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
