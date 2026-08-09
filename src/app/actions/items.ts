"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { fetchPriceSourceItems, searchPriceSourceItems } from "@/lib/priceSource";
import { refreshPanelsQuietly } from "@/lib/discordPanel";
import { PRICE_STATUS, ROLES } from "@/lib/constants";

async function saveUploadedImage(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
  const filename = `${crypto.randomUUID()}.${ext || "png"}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

/**
 * Loescht ein frueher lokal hochgeladenes Bild von der Platte, wenn es durch
 * ein neues ersetzt oder entfernt wurde. Nur fuer Pfade unter /uploads/ -
 * extern verlinkte Bild-URLs werden nie angefasst. Schlaegt bewusst leise
 * fehl (Datei evtl. schon weg), damit das eigentliche Speichern nie daran
 * scheitert.
 */
async function deleteUploadedImageIfLocal(imageUrl: string | null) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filePath = path.join(process.cwd(), "public", imageUrl);
  await fs.unlink(filePath).catch(() => {});
}

function readItemFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;

  const priceRaw = String(formData.get("averagePrice") ?? "").trim();
  const averagePrice = priceRaw ? Math.max(0, parseInt(priceRaw, 10) || 0) : null;

  const quantityRaw = String(formData.get("quantityTotal") ?? "1").trim();
  const quantityTotal = Math.max(1, parseInt(quantityRaw, 10) || 1);

  const imageUrlInput = String(formData.get("imageUrl") ?? "").trim();
  const removeImage = String(formData.get("removeImage") ?? "") === "true";
  const sourceKey = String(formData.get("sourceKey") ?? "").trim() || null;

  return {
    name,
    categoryId,
    description,
    sourceUrl,
    averagePrice,
    quantityTotal,
    imageUrlInput,
    removeImage,
    sourceKey,
  };
}

function refreshItemPages() {
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard/verwaltung/items");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function createItem(formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const fields = readItemFields(formData);
  if (!fields.name) return;

  const uploadedImage = await saveUploadedImage(formData.get("imageFile") as File | null);
  const imageUrl = uploadedImage || (fields.removeImage ? null : fields.imageUrlInput) || null;

  const item = await prisma.item.create({
    data: {
      name: fields.name,
      categoryId: fields.categoryId,
      description: fields.description,
      sourceUrl: fields.sourceUrl,
      sourceKey: fields.sourceKey,
      averagePrice: fields.averagePrice,
      priceStatus: fields.sourceKey ? PRICE_STATUS.OK : PRICE_STATUS.MANUAL,
      priceCheckedAt: fields.sourceKey ? new Date() : null,
      quantityTotal: fields.quantityTotal,
      imageUrl,
      createdById: member.id,
    },
  });

  await logAction({
    actorId: member.id,
    action: "ITEM_CREATED",
    details: `Item "${item.name}" angelegt.`,
  });

  refreshItemPages();
  await refreshPanelsQuietly();
  redirect("/dashboard/verwaltung/items");
}

export async function updateItem(itemId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const existing = await prisma.item.findUnique({ where: { id: itemId } });
  if (!existing) return;

  const fields = readItemFields(formData);
  if (!fields.name) return;

  const uploadedImage = await saveUploadedImage(formData.get("imageFile") as File | null);
  const imageUrl = uploadedImage
    ? uploadedImage
    : fields.removeImage
      ? null
      : fields.imageUrlInput || existing.imageUrl;

  // Altes lokal hochgeladenes Bild aufraeumen, sobald es ersetzt oder entfernt wird.
  if (existing.imageUrl && existing.imageUrl !== imageUrl) {
    await deleteUploadedImageIfLocal(existing.imageUrl);
  }

  const sourceKeyChanged = fields.sourceKey && fields.sourceKey !== existing.sourceKey;

  await prisma.item.update({
    where: { id: itemId },
    data: {
      name: fields.name,
      categoryId: fields.categoryId,
      description: fields.description,
      sourceUrl: fields.sourceUrl,
      sourceKey: fields.sourceKey ?? existing.sourceKey,
      averagePrice: fields.averagePrice,
      ...(sourceKeyChanged
        ? { priceStatus: PRICE_STATUS.OK, priceCheckedAt: new Date() }
        : {}),
      quantityTotal: fields.quantityTotal,
      imageUrl,
    },
  });

  await logAction({
    actorId: member.id,
    action: "ITEM_UPDATED",
    details: `Item "${fields.name}" bearbeitet.`,
  });

  refreshItemPages();
  await refreshPanelsQuietly();
  redirect("/dashboard/verwaltung/items");
}

export async function deleteItem(itemId: string) {
  const member = await requireMember(ROLES.OWNER);
  const existing = await prisma.item.findUnique({ where: { id: itemId } });
  if (!existing) return;

  await prisma.item.delete({ where: { id: itemId } });
  await deleteUploadedImageIfLocal(existing.imageUrl);

  await logAction({
    actorId: member.id,
    action: "ITEM_DELETED",
    details: `Item "${existing.name}" gelöscht.`,
  });

  refreshItemPages();
  await refreshPanelsQuietly();
}

export async function reportPriceUnavailable(itemId: string) {
  const member = await requireMember(ROLES.OWNER);
  const existing = await prisma.item.findUnique({ where: { id: itemId } });
  if (!existing) return;

  await prisma.item.update({
    where: { id: itemId },
    data: { priceStatus: PRICE_STATUS.UNAVAILABLE, priceCheckedAt: new Date() },
  });

  await logAction({
    actorId: member.id,
    action: "ITEM_PRICE_UNAVAILABLE",
    details: `Preisquelle für "${existing.name}" nicht mehr erreichbar, wurde markiert.`,
  });

  refreshItemPages();
}

export type PriceSourceSearchResult =
  | { ok: true; items: Awaited<ReturnType<typeof searchPriceSourceItems>> }
  | { ok: false; error: string };

/** Item-Suche gegen die externe Preisquelle für den Owner-Picker im Item-Formular. */
export async function searchPriceSourceAction(query: string): Promise<PriceSourceSearchResult> {
  await requireMember(ROLES.OWNER);
  try {
    const items = await searchPriceSourceItems(query, 12);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}

/**
 * Aktualisiert die Preise aller Items, die über den Picker mit der
 * Preisquelle verknüpft wurden (sourceKey gesetzt). Ist die Quelle
 * insgesamt nicht erreichbar oder liefert sie ein Item nicht mehr, wird das
 * jeweilige Item auf priceStatus "UNAVAILABLE" gesetzt und im Audit-Log
 * gemeldet, statt einen veralteten Preis stehen zu lassen.
 */
export async function refreshItemPrices() {
  const actor = await requireMember(ROLES.OWNER);
  const linkedItems = await prisma.item.findMany({ where: { sourceKey: { not: null } } });
  if (linkedItems.length === 0) return;

  let sourceItems;
  try {
    sourceItems = await fetchPriceSourceItems({ forceRefresh: true });
  } catch (err) {
    await prisma.item.updateMany({
      where: { id: { in: linkedItems.map((i) => i.id) } },
      data: { priceStatus: PRICE_STATUS.UNAVAILABLE, priceCheckedAt: new Date() },
    });
    await logAction({
      actorId: actor.id,
      action: "PRICE_SOURCE_UNREACHABLE",
      details: `Preisquelle nicht erreichbar (${
        err instanceof Error ? err.message : "unbekannter Fehler"
      }). ${linkedItems.length} verknüpfte Item(s) als nicht verfügbar markiert.`,
    });
    refreshItemPages();
    return;
  }

  const byKey = new Map(sourceItems.map((item) => [item.key, item]));
  let updated = 0;
  let unavailable = 0;

  for (const item of linkedItems) {
    const match = item.sourceKey ? byKey.get(item.sourceKey) : undefined;
    if (match) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          averagePrice: match.averagePrice,
          priceStatus: PRICE_STATUS.OK,
          priceCheckedAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.item.update({
        where: { id: item.id },
        data: { priceStatus: PRICE_STATUS.UNAVAILABLE, priceCheckedAt: new Date() },
      });
      unavailable++;
    }
  }

  await logAction({
    actorId: actor.id,
    action: "PRICES_REFRESHED",
    details: `${updated} Preis(e) aktualisiert, ${unavailable} nicht mehr in der Quelle gefunden.`,
  });

  refreshItemPages();
  await refreshPanelsQuietly();
}
