"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { blockRightsCore, cancelFineCore, issueFineCore, unblockRightsCore } from "@/lib/discipline";
import { setCustomSubscriptionCore, setSubscriptionPlanCore } from "@/lib/subscriptions";
import { ROLES } from "@/lib/constants";

export type DisziplinState = { ok: boolean; error?: string; hinweis?: string } | null;

function refresh(memberId: string) {
  revalidatePath(`/dashboard/akte/${memberId}`);
  revalidatePath("/dashboard/verwaltung/kunden");
  revalidatePath("/dashboard/verwaltung/logs");
}

/** Rechte sperren - nur Aufsicht und hoeher. */
export async function blockRights(
  memberId: string,
  _prev: DisziplinState,
  formData: FormData
): Promise<DisziplinState> {
  const actor = await requireMember(ROLES.AUFSICHT);
  const result = await blockRightsCore(memberId, String(formData.get("reason") ?? ""), actor.id);
  refresh(memberId);
  return result.ok ? { ok: true, hinweis: "Rechte gesperrt, die Person wurde per DM informiert." } : { ok: false, error: result.error };
}

export async function unblockRights(memberId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await unblockRightsCore(memberId, actor.id);
  refresh(memberId);
}

/** Geldstrafe verhaengen - nur Aufsicht und hoeher. */
export async function issueFine(
  memberId: string,
  _prev: DisziplinState,
  formData: FormData
): Promise<DisziplinState> {
  const actor = await requireMember(ROLES.AUFSICHT);
  const betrag = parseInt(String(formData.get("amount") ?? ""), 10);
  const result = await issueFineCore(memberId, betrag, String(formData.get("reason") ?? ""), actor.id);
  refresh(memberId);
  return result.ok ? { ok: true, hinweis: "Strafe verhängt, die Person wurde per DM informiert." } : { ok: false, error: result.error };
}

export async function cancelFine(memberId: string, fineId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await cancelFineCore(fineId, actor.id);
  refresh(memberId);
}

/**
 * Abo gewaehren, ohne Guthaben abzubuchen - nur Owner, weil das echtes Geld
 * ersetzt. Aufsicht kann weiterhin regulaer vom Guthaben abbuchen.
 */
export async function grantPlan(
  memberId: string,
  _prev: DisziplinState,
  formData: FormData
): Promise<DisziplinState> {
  const actor = await requireMember(ROLES.OWNER);
  const planId = String(formData.get("planId") ?? "");
  const result = await setSubscriptionPlanCore(memberId, planId, actor.id, { ohneAbbuchung: true });
  refresh(memberId);
  return result.ok
    ? { ok: true, hinweis: `Abo gewährt, läuft bis ${result.newExpiry.toLocaleDateString("de-DE")}.` }
    : { ok: false, error: result.error };
}

/** Freies Abo: Betrag und Laufzeit selbst vorgeben. */
export async function setCustomPlan(
  memberId: string,
  _prev: DisziplinState,
  formData: FormData
): Promise<DisziplinState> {
  const actor = await requireMember(ROLES.OWNER);
  const betrag = parseInt(String(formData.get("amount") ?? ""), 10);
  const tage = parseInt(String(formData.get("days") ?? ""), 10);
  const ohneAbbuchung = formData.get("ohneAbbuchung") !== null;

  const result = await setCustomSubscriptionCore(memberId, betrag, tage, actor.id, { ohneAbbuchung });
  refresh(memberId);
  return result.ok
    ? {
        ok: true,
        hinweis: `Abo gesetzt, läuft bis ${result.newExpiry.toLocaleDateString("de-DE")}.`,
      }
    : { ok: false, error: result.error };
}
