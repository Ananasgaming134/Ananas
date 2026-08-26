"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Setzt oder entfernt den Stern an einem Item. Rein persoenlich - es wird
 * immer nur die eigene Merkliste angefasst, die Mitglieds-ID kommt aus der
 * Sitzung und nie aus dem Formular.
 */
export async function toggleFavorite(itemId: string) {
  const member = await requireMember();
  if (!itemId) return;

  const vorhanden = await prisma.favorite.findUnique({
    where: { memberId_itemId: { memberId: member.id, itemId } },
    select: { id: true },
  });

  if (vorhanden) {
    await prisma.favorite.delete({ where: { id: vorhanden.id } });
  } else {
    // Das Item koennte zwischenzeitlich geloescht worden sein - dann still
    // nichts tun, statt die ganze Seite mit einem Fehler abzubrechen.
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) return;
    await prisma.favorite.create({ data: { memberId: member.id, itemId } });
  }

  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard/akte");
  revalidatePath("/dashboard");
}
