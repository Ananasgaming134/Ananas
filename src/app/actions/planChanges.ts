"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { approvePlanChangeCore, rejectPlanChangeCore, requestPlanChangeCore } from "@/lib/planChanges";
import { renewOwnSubscriptionCore } from "@/lib/subscriptions";
import { ROLES } from "@/lib/constants";

/** Gemeinsamer Rueckgabetyp fuer useActionState - trägt die Fehlermeldung in die UI. */
export type PlanChangeState = { ok: boolean; error?: string } | null;

function refresh() {
  revalidatePath("/dashboard/abo");
  revalidatePath("/dashboard/verwaltung/bewerbungen");
}

export async function requestPlanChange(
  _prevState: PlanChangeState,
  formData: FormData
): Promise<PlanChangeState> {
  const member = await requireMember();
  const requestedPlanId = String(formData.get("requestedPlanId") ?? "");
  if (!requestedPlanId) return { ok: false, error: "Bitte ein Paket auswählen." };

  const result = await requestPlanChangeCore(member.id, requestedPlanId);
  refresh();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function approvePlanChange(
  requestId: string,
  _prevState: PlanChangeState,
  _formData: FormData
): Promise<PlanChangeState> {
  const actor = await requireMember(ROLES.OWNER);
  const result = await approvePlanChangeCore(requestId, actor.id);
  refresh();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function rejectPlanChange(requestId: string) {
  const actor = await requireMember(ROLES.OWNER);
  await rejectPlanChangeCore(requestId, actor.id);
  refresh();
}

/** Selbstbedienung: Abo abschliessen/verlaengern, direkt vom Guthaben abgebucht. */
export async function purchasePlan(
  _prevState: PlanChangeState,
  formData: FormData
): Promise<PlanChangeState> {
  const member = await requireMember();
  const planId = String(formData.get("planId") ?? "");
  if (!planId) return { ok: false, error: "Bitte ein Paket auswählen." };

  const result = await renewOwnSubscriptionCore(member.id, planId);
  refresh();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/akte");

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    error: undefined,
  };
}
