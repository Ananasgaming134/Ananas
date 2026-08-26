import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncMemberRoleFromDiscord } from "@/lib/accessControl";
import { MEMBER_STATUS } from "@/lib/constants";

/**
 * Wird waehrend einer aktiven Sitzung alle 10 Sekunden vom Client
 * (RoleWatcher) aufgerufen, um die Discord-Rolle live gegen die Datenbank
 * zu pruefen. Bei Aenderung oder Entzug wird der Datensatz aktualisiert und
 * der Client zur Neuanmeldung gezwungen, damit die Sitzung nie eine
 * veraltete Berechtigung enthaelt. Prueft ausschliesslich die eigene,
 * per Session ermittelte Discord-ID - kein Zugriff auf fremde Konten moeglich.
 */
export async function GET() {
  const session = await auth();
  const discordId = session?.user?.id;
  if (!discordId) {
    return NextResponse.json({ ok: false, reason: "no-session" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({ where: { discordId } });
  if (!member) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }
  if (member.status === MEMBER_STATUS.BANNED || member.status === MEMBER_STATUS.REVOKED) {
    return NextResponse.json({ ok: false, reason: "access-revoked" });
  }

  // Gemeinsamer Zwischenspeicher mit dem Seitenaufruf: derselbe Nutzer loest
  // damit hoechstens eine Discord-Abfrage pro Minute aus, statt bei jedem
  // Takt eine neue. Das war die Hauptlast auf Discords Limit von fuenf
  // Abfragen pro Sekunde - und damit die Ursache der langen Wartezeiten.
  const status = await syncMemberRoleFromDiscord(member);

  // "unknown" heisst: Discord war kurz nicht erreichbar. Dann die Sitzung in
  // Ruhe lassen und beim naechsten Takt erneut versuchen.
  if (status === "revoked") return NextResponse.json({ ok: false, reason: "role-revoked" });
  if (status === "changed") return NextResponse.json({ ok: false, reason: "role-changed" });

  return NextResponse.json({ ok: true });
}
