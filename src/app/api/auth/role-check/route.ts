import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRoleLive } from "@/lib/discord";
import { logAction } from "@/lib/audit";
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

  const result = await checkRoleLive(discordId);

  if (result.status === "error") {
    // Discord-API kurzzeitig nicht erreichbar - Sitzung nicht anfassen.
    return NextResponse.json({ ok: true });
  }

  if (result.status === "revoked") {
    await prisma.member.update({
      where: { discordId },
      data: {
        status: MEMBER_STATUS.REVOKED,
        revokedAt: new Date(),
        revokedReason: "Automatisch erkannt: keine gueltige LeihCenter-Rolle mehr auf Discord.",
      },
    });
    await logAction({
      actorId: member.id,
      targetId: member.id,
      action: "ACCESS_AUTO_REVOKED",
      details: "Live-Rollenpruefung: Nutzer hat keine gueltige LeihCenter-Rolle mehr auf Discord.",
    });
    return NextResponse.json({ ok: false, reason: "role-revoked" });
  }

  if (result.role !== member.role) {
    await prisma.member.update({ where: { discordId }, data: { role: result.role } });
    await logAction({
      actorId: member.id,
      targetId: member.id,
      action: "ROLE_AUTO_CHANGED",
      details: `Live-Rollenpruefung: Rolle hat sich auf Discord geaendert (${member.role} -> ${result.role}). Sitzung wird zur Neuanmeldung aufgefordert.`,
    });
    return NextResponse.json({ ok: false, reason: "role-changed" });
  }

  return NextResponse.json({ ok: true });
}
