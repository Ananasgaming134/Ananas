import fs from "node:fs/promises";
import path from "node:path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function extensionForMimeType(mimeType: string): string {
  const ext = (mimeType.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
  return ext || "png";
}

/**
 * Schreibt ein Bild nach public/uploads und gibt den Pfad zurueck, unter dem
 * es abrufbar ist.
 *
 * Ausgeliefert wird ueber die API-Route, nicht direkt aus public/: next start
 * merkt sich die Liste der public-Dateien beim Prozessstart, wodurch alles,
 * was nach dem letzten Deploy hochgeladen wurde, sonst bis zum naechsten
 * Neustart mit 404 beantwortet wuerde.
 */
export async function writeImageFile(buffer: Buffer, mimeType: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), buffer);
  return `/api/uploads/${filename}`;
}

/**
 * Speichert eine hochgeladene Bilddatei. Ungueltige Dateien (falsches Format,
 * zu gross) liefern null, statt den ganzen Speichervorgang abzubrechen - das
 * Formular prueft bereits vorab, das hier ist die letzte Absicherung.
 */
export async function saveUploadedImage(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  return writeImageFile(buffer, file.type);
}

/**
 * Entfernt ein frueher hochgeladenes Bild von der Platte, wenn es ersetzt
 * oder geloescht wurde. Fasst nur eigene Uploads an - extern verlinkte
 * Bild-Adressen bleiben unberuehrt. Schlaegt bewusst leise fehl.
 */
export async function deleteUploadedImageIfLocal(imageUrl: string | null) {
  if (!imageUrl) return;
  const filename = imageUrl.startsWith("/api/uploads/")
    ? imageUrl.slice("/api/uploads/".length)
    : imageUrl.startsWith("/uploads/")
      ? imageUrl.slice("/uploads/".length)
      : null;
  if (!filename) return;
  await fs.unlink(path.join(process.cwd(), "public", "uploads", filename)).catch(() => {});
}
