"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { refreshPanelsQuietly, syncCategoryChannelsQuietly } from "@/lib/discordPanel";
import {
  addItemToSetCore,
  borrowSetCore,
  createSetCore,
  deleteSetCore,
  removeItemFromSetCore,
  renameSetCore,
} from "@/lib/itemSets";

export type SetState = { ok: boolean; error?: string; hinweis?: string } | null;

function refresh() {
  revalidatePath("/dashboard/sets");
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard");
}

export async function createSet(_prev: SetState, formData: FormData): Promise<SetState> {
  const member = await requireMember();
  const result = await createSetCore(member.id, String(formData.get("name") ?? ""));
  refresh();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function renameSet(setId: string, _prev: SetState, formData: FormData): Promise<SetState> {
  const member = await requireMember();
  const result = await renameSetCore(setId, member.id, String(formData.get("name") ?? ""));
  refresh();
  return result.ok ? { ok: true, hinweis: "Umbenannt." } : { ok: false, error: result.error };
}

export async function deleteSet(setId: string) {
  const member = await requireMember();
  await deleteSetCore(setId, member.id);
  refresh();
}

export async function addItemToSet(setId: string, _prev: SetState, formData: FormData): Promise<SetState> {
  const member = await requireMember();
  const result = await addItemToSetCore(setId, member.id, String(formData.get("itemId") ?? ""));
  refresh();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function removeItemFromSet(setId: string, itemId: string) {
  const member = await requireMember();
  await removeItemFromSetCore(setId, member.id, itemId);
  refresh();
}

/**
 * Leiht das ganze Set aus. Was nicht geht, wird uebersprungen - die Meldung
 * sagt danach genau, was geklappt hat und was nicht.
 */
export async function borrowSet(setId: string, _prev: SetState, _formData: FormData): Promise<SetState> {
  const member = await requireMember();
  const result = await borrowSetCore(setId, member.id);
  refresh();

  if (!result.ok) return { ok: false, error: result.error };

  const { ausgeliehen, uebersprungen } = result.ergebnis;

  // Discord-Panels erst nach der Antwort nachziehen - das dauert mehrere
  // Sekunden und der Knopf soll nicht so lange stillstehen.
  if (ausgeliehen.length > 0) {
    after(async () => {
      try {
        await refreshPanelsQuietly();
        await syncCategoryChannelsQuietly();
      } catch (err) {
        console.error("[sets] Panel-Aktualisierung fehlgeschlagen:", err);
      }
    });
  }

  if (ausgeliehen.length === 0) {
    return {
      ok: false,
      error: `Nichts ausgeliehen: ${uebersprungen.map((u) => `${u.name} (${u.grund})`).join(" · ")}`,
    };
  }

  if (uebersprungen.length > 0) {
    return {
      ok: true,
      hinweis:
        `${ausgeliehen.length} von ${ausgeliehen.length + uebersprungen.length} ausgeliehen. ` +
        `Nicht geklappt hat: ${uebersprungen.map((u) => u.name).join(", ")}.`,
    };
  }

  return { ok: true, hinweis: `Alle ${ausgeliehen.length} Items ausgeliehen.` };
}
