"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { unverifyMemberCore, verifyMemberCore } from "@/lib/verification";
import { canManage, hasAtLeastRole, ROLES } from "@/lib/constants";

export type VerifyState = { ok: boolean; error?: string; message?: string } | null;

function refresh(memberId: string) {
  revalidatePath(`/dashboard/akte/${memberId}`);
  revalidatePath("/dashboard/akte");
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard/verwaltung/kunden");
}

/**
 * Verifiziert den eigenen Minecraft-Account. Der Name wird bei Mojang
 * geprueft, die UUID gespeichert - dadurch faellt eine spaetere Umbenennung
 * beim Cron-Abgleich automatisch auf (siehe syncMinecraftNames).
 */
export async function verifySelf(_prevState: VerifyState, formData: FormData): Promise<VerifyState> {
  const member = await requireMember();
  const name = String(formData.get("minecraftName") ?? "");

  const result = await verifyMemberCore(member.id, name, member.id);
  refresh(member.id);

  return result.ok
    ? { ok: true, message: `✅ Verifiziert als „${result.minecraftName}“.` }
    : { ok: false, error: result.error };
}

/** Verifiziert ein anderes Mitglied (Aufsicht/Owner), z.B. nach Rueckfrage. */
export async function verifyMemberAsStaff(
  memberId: string,
  _prevState: VerifyState,
  formData: FormData
): Promise<VerifyState> {
  const actor = await requireMember(ROLES.AUFSICHT);
  const name = String(formData.get("minecraftName") ?? "");

  const result = await verifyMemberCore(memberId, name, actor.id);
  refresh(memberId);

  return result.ok
    ? { ok: true, message: `✅ Verifiziert als „${result.minecraftName}“.` }
    : { ok: false, error: result.error };
}

/** Zieht eine Verifizierung zurueck - nur Aufsicht/Owner, nicht bei sich selbst. */
export async function unverifyMember(memberId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const { prisma } = await import("@/lib/prisma");
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return;
  if (!hasAtLeastRole(actor.role, ROLES.OWNER) && !canManage(actor.role, target.role)) return;

  await unverifyMemberCore(memberId, actor.id);
  refresh(memberId);
}
