"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  deleteCategoryChannel,
  renameCategoryChannel,
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
  await syncCategoryChannelsQuietly();
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

  // Kanal mit umbenennen und das Panel darin aktualisieren.
  await renameCategoryChannel(categoryId, name).catch(() => {});
  await syncCategoryChannelsQuietly();
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

  await syncCategoryChannelsQuietly();
  refreshCategoryPages();
}
