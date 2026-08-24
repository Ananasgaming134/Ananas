"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { logAction } from "@/lib/audit";
import {
  addToBlacklistCore,
  importBlacklistFromChannel,
  removeFromBlacklistCore,
} from "@/lib/blacklist";
import { ROLES } from "@/lib/constants";

export type BlacklistFormState = { ok: boolean; message?: string; error?: string } | null;

function refresh() {
  revalidatePath("/dashboard/verwaltung/rote-liste");
  revalidatePath("/dashboard/verwaltung/bewerbungen");
}

/**
 * Traegt jemanden auf der roten Liste ein. Dauer leer = dauerhaft, sonst
 * Anzahl Tage bis zum automatischen Auslaufen.
 */
export async function addBlacklistEntry(
  _prevState: BlacklistFormState,
  formData: FormData
): Promise<BlacklistFormState> {
  const actor = await requireMember(ROLES.AUFSICHT);

  const discordId = String(formData.get("discordId") ?? "").replace(/[^\d]/g, "");
  const reason = String(formData.get("reason") ?? "").trim();
  const minecraftName = String(formData.get("minecraftName") ?? "").trim() || null;
  const minecraftUuid = String(formData.get("minecraftUuid") ?? "").trim() || null;
  const daysRaw = String(formData.get("days") ?? "").trim();

  if (!discordId) return { ok: false, error: "Bitte eine gültige Discord-ID angeben." };
  if (!reason) return { ok: false, error: "Bitte einen Grund angeben." };

  let expiresAt: Date | null = null;
  if (daysRaw) {
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) {
      return { ok: false, error: "Dauer muss eine Zahl größer als 0 sein (oder leer für dauerhaft)." };
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const result = await addToBlacklistCore({
    discordId,
    reason,
    minecraftName,
    minecraftUuid,
    expiresAt,
    actorId: actor.id,
  });

  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return {
    ok: true,
    message: expiresAt
      ? `Eingetragen — Sperre läuft am ${expiresAt.toLocaleDateString("de-DE")} automatisch aus.`
      : "Dauerhaft auf die rote Liste gesetzt.",
  };
}

export async function removeBlacklistEntry(discordId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await removeFromBlacklistCore(discordId, actor.id);
  refresh();
}

/** Liest die bestehenden Eintraege aus dem Discord-Blacklist-Kanal ein. */
export async function importBlacklist(): Promise<void> {
  const actor = await requireMember(ROLES.OWNER);
  const result = await importBlacklistFromChannel();
  await logAction({
    actorId: actor.id,
    action: "BLACKLIST_IMPORT_RUN",
    details: `${result.found} im Kanal gefunden, ${result.imported} neu übernommen, ${result.skipped} bereits vorhanden.`,
  });
  refresh();
}
