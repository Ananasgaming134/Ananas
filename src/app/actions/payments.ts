"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkForNewPayments } from "@/lib/payments";
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

/**
 * Schreibt eine erkannte Zahlung als Guthaben auf dem Konto des zugeordneten
 * Mitglieds gut - 1 ₵ = 1 $ (direkt vergleichbar). Ordnet NICHT direkt einem
 * Abo-Paket zu; das Abbuchen eines Pakets vom Guthaben passiert separat
 * (setSubscriptionPlanCore, z.B. ueber "Abo zuweisen/verlängern" auf der
 * Akte-Seite). Guthaben wird nie zurücküberwiesen, bleibt also dauerhaft
 * hinterlegt bis es abgebucht wird oder das Mitglied gebannt wird.
 */
export async function creditPaymentToBalance(paymentId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING" || !payment.memberId) return;

  await prisma.member.update({
    where: { id: payment.memberId },
    data: { balance: { increment: payment.amount } },
  });

  await prisma.payment.update({ where: { id: paymentId }, data: { status: "APPLIED" } });

  await logAction({
    actorId: actor.id,
    targetId: payment.memberId,
    action: "PAYMENT_CREDITED",
    details: `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) als Guthaben gutgeschrieben.`,
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
