"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createPartnerCore, deletePartnerCore, updatePartnerCore, type PartnerInput } from "@/lib/partners";
import { saveSiteConfigCore } from "@/lib/siteConfig";
import { ROLES } from "@/lib/constants";

export type FormState = { ok?: true; error?: string } | null;

function refresh() {
  revalidatePath("/dashboard/verwaltung/kooperationen");
  revalidatePath("/dashboard/verwaltung/impressum");
  revalidatePath("/");
  revalidatePath("/impressum");
  revalidatePath("/datenschutz");
}

function readPartner(formData: FormData): PartnerInput {
  const datei = (name: string) => {
    const value = formData.get(name);
    return value instanceof File && value.size > 0 ? value : null;
  };

  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    discordUrl: String(formData.get("discordUrl") ?? "") || null,
    sortOrder: parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0,
    active: formData.get("active") !== null,
    banner: datei("banner"),
    avatar: datei("avatar"),
    bannerEntfernen: formData.get("bannerEntfernen") !== null,
    avatarEntfernen: formData.get("avatarEntfernen") !== null,
  };
}

export async function createPartner(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireMember(ROLES.OWNER);
  const result = await createPartnerCore(readPartner(formData), actor.id);
  refresh();
  return result.ok ? { ok: true } : { error: result.error };
}

export async function updatePartner(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireMember(ROLES.OWNER);
  const id = String(formData.get("id") ?? "");
  const result = await updatePartnerCore(id, readPartner(formData), actor.id);
  refresh();
  return result.ok ? { ok: true } : { error: result.error };
}

export async function deletePartner(id: string) {
  const actor = await requireMember(ROLES.OWNER);
  await deletePartnerCore(id, actor.id);
  refresh();
}

export async function saveSiteConfig(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireMember(ROLES.OWNER);
  const result = await saveSiteConfigCore(
    {
      impressum: String(formData.get("impressum") ?? ""),
      datenschutz: String(formData.get("datenschutz") ?? ""),
      discordInviteUrl: String(formData.get("discordInviteUrl") ?? ""),
    },
    actor.id
  );
  refresh();
  return result.ok ? { ok: true } : { error: result.error };
}
