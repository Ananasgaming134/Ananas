import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const SANCTION_TYPE = {
  VERWARNUNG: "VERWARNUNG",
  AUSLEIHSPERRE: "AUSLEIHSPERRE",
  SONSTIGES: "SONSTIGES",
} as const;
export type SanctionTypeValue = (typeof SANCTION_TYPE)[keyof typeof SANCTION_TYPE];

export const SANCTION_TYPE_LABELS: Record<string, string> = {
  VERWARNUNG: "Verwarnung",
  AUSLEIHSPERRE: "Ausleih-Sperre",
  SONSTIGES: "Sonstiges",
};

/** Haeufige Gruende als Vorauswahl - Freitext bleibt trotzdem moeglich. */
export const SANCTION_REASON_PRESETS = [
  "Leihdauer überschritten",
  "Zu viele Items gleichzeitig",
  "Item nicht zurückgegeben",
  "Item beschädigt/verloren",
  "Regelverstoß im Discord",
];

export type SanctionResult = { ok: true; sanctionId: string } | { ok: false; error: string };

export async function addSanctionCore(
  memberId: string,
  type: string,
  reason: string,
  actorId: string
): Promise<SanctionResult> {
  if (!reason.trim()) return { ok: false, error: "Bitte einen Grund angeben." };
  if (!(type in SANCTION_TYPE_LABELS)) return { ok: false, error: "Unbekannte Sanktionsart." };

  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };

  const sanction = await prisma.sanction.create({
    data: { memberId, type, reason: reason.trim(), issuedById: actorId },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "SANCTION_ADDED",
    details: `${SANCTION_TYPE_LABELS[type]} eingetragen: ${reason.trim()}`,
  });

  return { ok: true, sanctionId: sanction.id };
}

export async function removeSanctionCore(
  sanctionId: string,
  actorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sanction = await prisma.sanction.findUnique({ where: { id: sanctionId } });
  if (!sanction) return { ok: false, error: "Sanktion nicht gefunden." };

  await prisma.sanction.delete({ where: { id: sanctionId } });
  await logAction({
    actorId,
    targetId: sanction.memberId,
    action: "SANCTION_REMOVED",
    details: `${SANCTION_TYPE_LABELS[sanction.type] ?? sanction.type} entfernt: ${sanction.reason}`,
  });

  return { ok: true };
}
