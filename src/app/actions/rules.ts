"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { saveRuleSetCore, type TextSchluessel } from "@/lib/rules";
import { ROLES } from "@/lib/constants";

export type RulesFormState = { ok: boolean; message?: string; error?: string } | null;

/**
 * Speichert einen gepflegten Text (nur Owner/Admin) und spiegelt ihn nach
 * Discord. Markdown bleibt erhalten - der Text wird 1:1 uebernommen.
 */
export async function saveRules(
  schluessel: TextSchluessel,
  _prevState: RulesFormState,
  formData: FormData
): Promise<RulesFormState> {
  const actor = await requireMember(ROLES.OWNER);
  const content = String(formData.get("content") ?? "");

  const result = await saveRuleSetCore(content, actor.id, schluessel);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard/regelwerk");
  revalidatePath("/dashboard/verwaltung/regelwerk");
  revalidatePath("/dashboard/info");
  revalidatePath("/dashboard/verwaltung/info");

  return result.discordOk
    ? { ok: true, message: "Gespeichert und in Discord aktualisiert." }
    : {
        ok: true,
        message: `Gespeichert. Discord konnte nicht aktualisiert werden: ${result.discordError}`,
      };
}
