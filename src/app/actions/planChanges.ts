"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { approvePlanChangeCore, rejectPlanChangeCore, requestPlanChangeCore } from "@/lib/planChanges";
import { ROLES } from "@/lib/constants";

function refresh() {
  revalidatePath("/dashboard/abo");
  revalidatePath("/dashboard/verwaltung/bewerbungen");
}

export async function requestPlanChange(formData: FormData) {
  const member = await requireMember();
  const requestedPlanId = String(formData.get("requestedPlanId") ?? "");
  if (!requestedPlanId) return;
  await requestPlanChangeCore(member.id, requestedPlanId);
  refresh();
}

export async function approvePlanChange(requestId: string) {
  const actor = await requireMember(ROLES.OWNER);
  await approvePlanChangeCore(requestId, actor.id);
  refresh();
}

export async function rejectPlanChange(requestId: string) {
  const actor = await requireMember(ROLES.OWNER);
  await rejectPlanChangeCore(requestId, actor.id);
  refresh();
}
