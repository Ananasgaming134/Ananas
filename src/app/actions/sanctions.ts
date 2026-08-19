"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { addSanctionCore, removeSanctionCore } from "@/lib/sanctions";
import { ROLES } from "@/lib/constants";

export type SanctionState = { ok: boolean; error?: string } | null;

function refresh(memberId: string) {
  revalidatePath(`/dashboard/akte/${memberId}`);
  revalidatePath("/dashboard/verwaltung/logs");
}

export async function addSanction(
  memberId: string,
  _prevState: SanctionState,
  formData: FormData
): Promise<SanctionState> {
  const actor = await requireMember(ROLES.AUFSICHT);
  const type = String(formData.get("type") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const result = await addSanctionCore(memberId, type, reason, actor.id);
  refresh(memberId);

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function removeSanction(sanctionId: string, memberId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await removeSanctionCore(sanctionId, actor.id);
  refresh(memberId);
}
