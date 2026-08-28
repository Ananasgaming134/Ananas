"use server";

import { after } from "next/server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  deleteCategoryChannel,
  repostCategoryPanel,
  syncCategoryChannelsQuietly,
} from "@/lib/discordPanel";
import { ROLES } from "@/lib/constants";

function refreshCategoryPages() {
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard/verwaltung/items");
  revalidatePath("/dashboard/verwaltung/items/kategorien");
  revalidatePath("/dashboard/verwaltung/items/neu");
}

export async function createCategory(formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) return;

  const category = await prisma.category.create({ data: { name } });
  await logAction({
    actorId: member.id,
    action: "CATEGORY_CREATED",
    details: `Kategorie "${category.name}" angelegt.`,
  });

  // Legt den zugehoerigen Discord-Textkanal samt Panel an.
  kategorienNachziehen();
  refreshCategoryPages();
}

export async function renameCategory(categoryId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing || existing.name === name) return;

  await prisma.category.update({ where: { id: categoryId }, data: { name } });
  await logAction({
    actorId: member.id,
    action: "CATEGORY_RENAMED",
    details: `Kategorie "${existing.name}" umbenannt zu "${name}".`,
  });

  // Der Kanal selbst gehoert den Ownern und wird nicht angefasst - nur das
  // Panel darin traegt den neuen Namen.
  kategorienNachziehen();
  refreshCategoryPages();
}

/** Loescht eine Kategorie - Items darin bleiben erhalten, verlieren nur die Zuordnung (onDelete: SetNull). */
export async function deleteCategory(categoryId: string) {
  const member = await requireMember(ROLES.OWNER);
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) return;

  // Kanal VOR dem Loeschen entfernen - danach ist die gespeicherte ID weg.
  await deleteCategoryChannel(categoryId).catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } });
  await logAction({
    actorId: member.id,
    action: "CATEGORY_DELETED",
    details: `Kategorie "${existing.name}" gelöscht. Zugeordnete Items sind jetzt ohne Kategorie.`,
  });

  kategorienNachziehen();
  refreshCategoryPages();
}

/**
 * Kategorie-Kanaele nachziehen - nach dem Ausliefern der Antwort, damit das
 * Speichern nicht auf Discord wartet.
 */
function kategorienNachziehen() {
  after(async () => {
    try {
      await syncCategoryChannelsQuietly();
    } catch (err) {
      console.error("[kategorien] Kanal-Abgleich fehlgeschlagen:", err);
    }
  });
}

/**
 * Hinterlegt, in welchen Discord-Kanal das Panel dieser Kategorie geht.
 * Wechselt der Kanal, werden die Nachrichten im alten Kanal entfernt, damit
 * dort kein veraltetes Panel stehen bleibt.
 */
export async function setCategoryChannel(categoryId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const eingabe = String(formData.get("channelId") ?? "").trim();

  // Nur Ziffern - eine Discord-Kanal-ID ist immer eine reine Zahl.
  const channelId = eingabe && /^\d{5,}$/.test(eingabe) ? eingabe : null;
  if (eingabe && !channelId) return;

  const vorher = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!vorher || vorher.discordChannelId === channelId) return;

  if (vorher.discordChannelId) await deleteCategoryChannel(categoryId);

  await prisma.category.update({
    where: { id: categoryId },
    data: { discordChannelId: channelId, panelMessageIds: null, panelHash: null },
  });

  await logAction({
    actorId: member.id,
    action: "CATEGORY_CHANNEL_SET",
    details: channelId
      ? `Kategorie "${vorher.name}": Panel-Kanal auf ${channelId} gesetzt.`
      : `Kategorie "${vorher.name}": Panel-Kanal entfernt.`,
  });

  kategorienNachziehen();
  refreshCategoryPages();
}

/** Schickt das Panel einer Kategorie neu in ihren Kanal. */
export async function resendCategoryPanel(categoryId: string) {
  const member = await requireMember(ROLES.OWNER);
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return;

  const result = await repostCategoryPanel(categoryId);
  await logAction({
    actorId: member.id,
    action: "CATEGORY_PANEL_RESENT",
    details: result.ok
      ? `Panel für "${category.name}" neu gesendet.`
      : `Panel für "${category.name}" konnte nicht gesendet werden: ${result.error}`,
  });

  refreshCategoryPages();
}
