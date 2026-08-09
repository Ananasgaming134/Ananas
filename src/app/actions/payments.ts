"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkForNewPayments } from "@/lib/payments";
import { setSubscriptionPlanCore } from "@/lib/subscriptions";
import { ROLES } from "@/lib/constants";

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

/** Ordnet eine erkannte Zahlung einem Abo-Plan zu und verlaengert das Abo des zugeordneten Mitglieds entsprechend. */
export async function applyPaymentToPlan(paymentId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING" || !payment.memberId) return;

  const planId = String(formData.get("planId") ?? "");
  const result = await setSubscriptionPlanCore(payment.memberId, planId, actor.id);
  if (!result.ok) return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "APPLIED", appliedPlanId: result.plan.id },
  });

  await logAction({
    actorId: actor.id,
    targetId: payment.memberId,
    action: "PAYMENT_APPLIED",
    details: `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) als "${result.plan.label}" bestätigt.`,
  });

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
