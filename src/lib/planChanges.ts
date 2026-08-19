import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { formatCoins, getSubscriptionPlan } from "@/lib/constants";

export type PlanChangeResult = { ok: true } | { ok: false; error: string };

/**
 * Kunde beantragt ein anderes Abo-Paket - muss vom Owner genehmigt werden.
 * Schon beim Beantragen muss das Guthaben fuer das gewuenschte Paket
 * reichen, damit gar keine Anfragen entstehen, die spaeter ohnehin nicht
 * gebucht werden koennen. Beim Genehmigen wird erneut geprueft (siehe
 * approvePlanChangeCore), da sich das Guthaben zwischenzeitlich aendern kann.
 */
export async function requestPlanChangeCore(memberId: string, requestedPlanId: string): Promise<PlanChangeResult> {
  const plan = getSubscriptionPlan(requestedPlanId);
  if (!plan) return { ok: false, error: "Ungültiges Abo-Paket." };

  const existing = await prisma.planChangeRequest.findFirst({ where: { memberId, status: "PENDING" } });
  if (existing) return { ok: false, error: "Du hast bereits eine offene Wechsel-Anfrage." };

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { ok: false, error: "Mitglied nicht gefunden." };
  if (member.balance < plan.price) {
    return {
      ok: false,
      error: `Dafür brauchst du ${formatCoins(plan.price)} Guthaben - du hast aktuell ${formatCoins(member.balance)}. Lade erst auf, dann kannst du den Wechsel beantragen.`,
    };
  }

  await prisma.planChangeRequest.create({ data: { memberId, requestedPlanId } });
  await logAction({
    targetId: memberId,
    action: "PLAN_CHANGE_REQUESTED",
    details: `Paketwechsel zu "${plan.label}" beantragt.`,
  });
  return { ok: true };
}

/**
 * Genehmigt den Paketwechsel: aendert nur subscriptionPlan/monthlyFee fuer
 * die naechste Verlaengerung - die laufende Periode (feePaidUntil) bleibt
 * unangetastet, es wird nichts rueckwirkend verrechnet. Das Guthaben wird
 * hier NICHT abgebucht (das passiert erst beim tatsaechlichen Verlaengern
 * ueber setSubscriptionPlanCore), muss aber trotzdem reichen - sonst wuerde
 * ein Paket genehmigt, das beim naechsten Buchen sofort scheitert.
 */
export async function approvePlanChangeCore(requestId: string, actorId: string): Promise<PlanChangeResult> {
  const req = await prisma.planChangeRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "Anfrage nicht gefunden oder bereits bearbeitet." };

  const plan = getSubscriptionPlan(req.requestedPlanId);
  if (!plan) return { ok: false, error: "Ungültiges Abo-Paket." };

  const member = await prisma.member.findUnique({ where: { id: req.memberId } });
  if (!member) return { ok: false, error: "Mitglied nicht gefunden." };
  if (member.balance < plan.price) {
    return {
      ok: false,
      error: `${member.displayName} hat nur ${formatCoins(member.balance)} Guthaben, "${plan.label}" kostet ${formatCoins(plan.price)}. Wechsel erst genehmigen, wenn genug Guthaben da ist.`,
    };
  }

  await prisma.member.update({ where: { id: req.memberId }, data: { subscriptionPlan: plan.id, monthlyFee: plan.price } });
  await prisma.planChangeRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date() },
  });

  await logAction({
    actorId,
    targetId: req.memberId,
    action: "PLAN_CHANGE_APPROVED",
    details: `Paketwechsel zu "${plan.label}" genehmigt (wirkt ab der nächsten Verlängerung).`,
  });
  return { ok: true };
}

export async function rejectPlanChangeCore(requestId: string, actorId: string): Promise<PlanChangeResult> {
  const req = await prisma.planChangeRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "Anfrage nicht gefunden oder bereits bearbeitet." };

  await prisma.planChangeRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date() },
  });

  await logAction({ actorId, targetId: req.memberId, action: "PLAN_CHANGE_REJECTED", details: "Paketwechsel abgelehnt." });
  return { ok: true };
}
