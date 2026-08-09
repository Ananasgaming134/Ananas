import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// Erlaubt genau die Dateinamen, die writeImageFile() in src/app/actions/items.ts
// erzeugt (crypto.randomUUID() + Endung) - blockt damit auch jeden Path-Traversal-Versuch.
const FILENAME_PATTERN = /^[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i;

/**
 * Liest hochgeladene Item-Bilder direkt von der Platte statt sie ueber das
 * statische public/-Verzeichnis auszuliefern: next start (Turbopack-Build)
 * cached die public/-Dateiliste beim Start des Prozesses, wodurch Bilder,
 * die NACH dem letzten Deploy/Neustart hochgeladen wurden, mit 404
 * beantwortet wurden, bis der Server neu gestartet ist. Ein Route Handler
 * liest bei jedem Request live von der Platte und hat dieses Problem nicht.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Ungültiger Dateiname" }, { status: 400 });
  }

  const ext = filename.split(".").pop()!.toLowerCase();
  const filePath = path.join(process.cwd(), "public", "uploads", filename);

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
}
