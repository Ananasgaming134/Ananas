"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkForNewPayments, creditPaymentCore } from "@/lib/payments";
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
 * Verbucht eine erkannte Zahlung von Hand. Normalerweise passiert das
 * automatisch, sobald die Zahlung im Zahlungskanal auftaucht - dieser Weg
 * bleibt fuer Zahlungen, die sich nicht automatisch zuordnen liessen und
 * denen in der Verwaltung erst ein Mitglied zugewiesen wurde.
 */
export async function creditPaymentToBalance(paymentId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await creditPaymentCore(paymentId, actor.id);
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
