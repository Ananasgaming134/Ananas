import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { deleteUploadedImageIfLocal, saveUploadedImage } from "@/lib/uploads";

export type PartnerResult = { ok: true } | { ok: false; error: string };

export type PartnerInput = {
  name: string;
  description: string | null;
  discordUrl: string | null;
  sortOrder: number;
  active: boolean;
  banner: File | null;
  avatar: File | null;
  bannerEntfernen?: boolean;
  avatarEntfernen?: boolean;
};

/**
 * Erlaubt sind nur http(s)-Adressen. Ohne diese Pruefung liessen sich
 * javascript:-Adressen hinterlegen, die beim Klick im Browser des Besuchers
 * ausgefuehrt wuerden.
 */
function pruefeLink(url: string | null): { ok: true; url: string | null } | { ok: false; error: string } {
  if (!url) return { ok: true, url: null };
  const trimmed = url.trim();
  if (!trimmed) return { ok: true, url: null };
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    return { ok: false, error: "Der Link muss mit http:// oder https:// beginnen." };
  }
  return { ok: true, url: trimmed };
}

/** Alle sichtbaren Partner fuer die Startseite, in der eingestellten Reihenfolge. */
export async function getPublicPartners() {
  return prisma.partner.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPartnerCore(input: PartnerInput, actorId: string): Promise<PartnerResult> {
  if (!input.name.trim()) return { ok: false, error: "Ein Name ist Pflicht." };

  const link = pruefeLink(input.discordUrl);
  if (!link.ok) return link;

  const [bannerUrl, avatarUrl] = await Promise.all([
    saveUploadedImage(input.banner),
    saveUploadedImage(input.avatar),
  ]);

  const partner = await prisma.partner.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      discordUrl: link.url,
      sortOrder: input.sortOrder,
      active: input.active,
      bannerUrl,
      avatarUrl,
    },
  });

  await logAction({
    actorId,
    action: "PARTNER_CREATED",
    details: `Kooperation "${partner.name}" angelegt.`,
  });

  return { ok: true };
}

export async function updatePartnerCore(
  id: string,
  input: PartnerInput,
  actorId: string
): Promise<PartnerResult> {
  const existing = await prisma.partner.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Kooperation nicht gefunden." };
  if (!input.name.trim()) return { ok: false, error: "Ein Name ist Pflicht." };

  const link = pruefeLink(input.discordUrl);
  if (!link.ok) return link;

  const [neuerBanner, neuerAvatar] = await Promise.all([
    saveUploadedImage(input.banner),
    saveUploadedImage(input.avatar),
  ]);

  // Ein neues Bild ersetzt das alte, ein Haken entfernt es - sonst bleibt es.
  const bannerUrl = neuerBanner ?? (input.bannerEntfernen ? null : existing.bannerUrl);
  const avatarUrl = neuerAvatar ?? (input.avatarEntfernen ? null : existing.avatarUrl);

  await prisma.partner.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      discordUrl: link.url,
      sortOrder: input.sortOrder,
      active: input.active,
      bannerUrl,
      avatarUrl,
    },
  });

  // Erst nach dem Speichern aufraeumen, damit bei einem Fehler kein Bild fehlt.
  if (existing.bannerUrl && existing.bannerUrl !== bannerUrl) {
    await deleteUploadedImageIfLocal(existing.bannerUrl);
  }
  if (existing.avatarUrl && existing.avatarUrl !== avatarUrl) {
    await deleteUploadedImageIfLocal(existing.avatarUrl);
  }

  await logAction({
    actorId,
    action: "PARTNER_UPDATED",
    details: `Kooperation "${input.name.trim()}" bearbeitet.`,
  });

  return { ok: true };
}

export async function deletePartnerCore(id: string, actorId: string): Promise<PartnerResult> {
  const existing = await prisma.partner.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Kooperation nicht gefunden." };

  await prisma.partner.delete({ where: { id } });
  await deleteUploadedImageIfLocal(existing.bannerUrl);
  await deleteUploadedImageIfLocal(existing.avatarUrl);

  await logAction({
    actorId,
    action: "PARTNER_DELETED",
    details: `Kooperation "${existing.name}" entfernt.`,
  });

  return { ok: true };
}
