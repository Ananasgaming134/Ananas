"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkForNewPayments } from "@/lib/payments";
import { setSubscriptionPlanCore } from "@/lib/subscriptions";
import { ROLES, getSubscriptionPlan } from "@/lib/constants";

function refreshPaymentPages() {
  revalidatePath("/dashboard/verwaltung/zahlungen");
}

export async function checkPayments() {
  const member = await requireMember(ROLES.AUFSICHT);

  const result = await checkForNewPayments();
  await logAction({
    actorId: member.id,
    action: result.ok ? "PAYMENTS_CHECKED" : "PAYMENTS_CHECK_FAILED",
    details: result.ok
      ? `${result.found} neue Zahlung(en) erkannt.`
      : `Fehlgeschlagen: ${result.error}`,
  });

  refreshPaymentPages();
}

/**
 * Ordnet eine erkannte Zahlung einem Abo-Plan zu. 1 ₵ = 1 $ (direkt
 * vergleichbar) - reicht der Betrag nicht fuer den vollen Plan-Preis, wird
 * er als Teilzahlung auf member.openBalance angerechnet und das Abo NICHT
 * verlaengert; erst wenn der offene Betrag auf 0 sinkt, wird tatsaechlich
 * verlaengert (setSubscriptionPlanCore). Startet eine neue "Rechnung" (voller
 * Plan-Preis als offener Betrag), falls noch keine fuer dieses Paket laeuft.
 */
export async function applyPaymentToPlan(paymentId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING" || !payment.memberId) return;

  const planId = String(formData.get("planId") ?? "");
  const plan = getSubscriptionPlan(planId);
  if (!plan) return;

  const member = await prisma.member.findUnique({ where: { id: payment.memberId } });
  if (!member) return;

  const openBalance = member.subscriptionPlan === planId && member.openBalance > 0 ? member.openBalance : plan.price;
  const remaining = openBalance - payment.amount;

  let details: string;
  if (remaining <= 0) {
    const result = await setSubscriptionPlanCore(member.id, planId, actor.id);
    if (!result.ok) return;
    details = `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) vollständig auf "${result.plan.label}" angerechnet - Abo verlängert.`;
  } else {
    await prisma.member.update({
      where: { id: member.id },
      data: { subscriptionPlan: planId, openBalance: remaining },
    });
    details = `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) auf "${plan.label}" angerechnet - noch $${remaining.toLocaleString("en-US")} offen.`;
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "APPLIED", appliedPlanId: planId },
  });

  await logAction({ actorId: actor.id, targetId: payment.memberId, action: "PAYMENT_APPLIED", details });

  refreshPaymentPages();
}

export async function ignorePayment(paymentId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING") return;

  await prisma.payment.update({ where: { id: paymentId }, data: { status: "IGNORED" } });

  await logAction({
    actorId: actor.id,
    targetId: payment.memberId,
    action: "PAYMENT_IGNORED",
    details: `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) ignoriert.`,
  });

  refreshPaymentPages();
}
