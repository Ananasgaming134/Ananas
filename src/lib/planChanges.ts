import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { TICKET_CATEGORY, closeTicketCore, createTicketCore } from "@/lib/tickets";
import {
  MAX_SUBSCRIPTION_AHEAD_MONTHS,
  exceedsMaxSubscription,
  formatCoins,
  getSubscriptionPlan,
  subscriptionEndAfter,
} from "@/lib/constants";

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

  if (exceedsMaxSubscription(plan, member.feePaidUntil)) {
    const ende = subscriptionEndAfter(plan, member.feePaidUntil);
    return {
      ok: false,
      error:
        `Damit würde dein Abo bis ${ende.toLocaleDateString("de-DE")} laufen — weiter als ` +
        `${MAX_SUBSCRIPTION_AHEAD_MONTHS} Monate im Voraus geht nicht. Nimm ein kürzeres Paket oder beantrage es später.`,
    };
  }

  if (member.balance < plan.price) {
    return {
      ok: false,
      error: `Dafür brauchst du ${formatCoins(plan.price)} Guthaben - du hast aktuell ${formatCoins(member.balance)}. Lade erst auf, dann kannst du den Wechsel beantragen.`,
    };
  }

  const request = await prisma.planChangeRequest.create({ data: { memberId, requestedPlanId } });

  // Zum Antrag gehoert immer ein Discord-Ticket: dort bespricht das Team den
  // Wechsel mit dem Kunden und entscheidet per /abo bestaetigen bzw. ablehnen.
  const currentPlan = getSubscriptionPlan(member.subscriptionPlan);
  const isFirstPlan = !member.subscriptionPlan;
  const details = [
    `**Gewünschtes Paket:** ${plan.label} — ${formatCoins(plan.price)}`,
    `**Bisher:** ${currentPlan ? currentPlan.label : "noch kein Abo"}`,
    `**Guthaben:** ${formatCoins(member.balance)}`,
    member.feePaidUntil
      ? `**Läuft aktuell bis:** ${member.feePaidUntil.toLocaleDateString("de-DE")}`
      : "**Läuft aktuell bis:** —",
    "",
    isFirstPlan
      ? "Erstes Abo. Nach der Bestätigung wird das Paket vom Guthaben abgebucht."
      : "Der Wechsel gilt ab der nächsten Verlängerung, die laufende Zeit bleibt unangetastet.",
    "",
    "Entscheidung per `/abo bestaetigen` oder `/abo ablehnen` in diesem Ticket.",
  ].join("\n");

  const ticket = await createTicketCore({
    category: TICKET_CATEGORY.ABO,
    subject: isFirstPlan ? `Abo-Antrag: ${plan.label}` : `Paketwechsel zu ${plan.label}`,
    applicantDiscordId: member.discordId,
    memberId: member.id,
    initialMessage: details,
  });

  if (ticket.ok) {
    await prisma.planChangeRequest.update({
      where: { id: request.id },
      data: { ticketId: ticket.ticketId },
    });
  }

  await logAction({
    targetId: memberId,
    action: "PLAN_CHANGE_REQUESTED",
    details: `${isFirstPlan ? "Abo" : "Paketwechsel"} zu "${plan.label}" beantragt${ticket.ok ? " (Ticket eröffnet)" : ""}.`,
  });

  return { ok: true };
}

/**
 * Schliesst das Ticket zu einem entschiedenen Antrag und postet vorher das
 * Ergebnis hinein, damit der Kunde die Entscheidung im Verlauf sieht.
 */
async function finishPlanChangeTicket(
  ticketId: string | null,
  actorId: string,
  message: string
): Promise<void> {
  if (!ticketId) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (ticket?.discordChannelId) {
    await fetch(`https://discord.com/api/v10/channels/${ticket.discordChannelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `<@${ticket.applicantDiscordId}>`,
        embeds: [{ description: message, color: 0x5b8cff }],
        allowed_mentions: { users: [ticket.applicantDiscordId] },
      }),
    }).catch(() => {});
  }

  await closeTicketCore(ticketId, actorId).catch(() => {});
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

  await finishPlanChangeTicket(
    req.ticketId,
    actorId,
    `✅ **Abo bestätigt** — dein Paket steht jetzt auf **${plan.label}** (${formatCoins(plan.price)}).\n` +
      "Abgebucht wird beim nächsten Verlängern vom Guthaben."
  );

  await logAction({
    actorId,
    targetId: req.memberId,
    action: "PLAN_CHANGE_APPROVED",
    details: `Paketwechsel zu "${plan.label}" genehmigt (wirkt ab der nächsten Verlängerung).`,
  });
  return { ok: true };
}

export async function rejectPlanChangeCore(
  requestId: string,
  actorId: string,
  reason?: string | null
): Promise<PlanChangeResult> {
  const req = await prisma.planChangeRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "Anfrage nicht gefunden oder bereits bearbeitet." };

  await prisma.planChangeRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedById: actorId, reviewedAt: new Date() },
  });

  await finishPlanChangeTicket(
    req.ticketId,
    actorId,
    `❌ **Abo-Antrag abgelehnt.**${reason ? `\nGrund: ${reason}` : ""}\n` +
      "Bei Fragen dazu einfach ein Support-Ticket aufmachen."
  );

  await logAction({
    actorId,
    targetId: req.memberId,
    action: "PLAN_CHANGE_REJECTED",
    details: reason ? `Paketwechsel abgelehnt: ${reason}` : "Paketwechsel abgelehnt.",
  });
  return { ok: true };
}

/** Findet den offenen Antrag zu einem Ticket - fuer die Slash-Befehle im Thread. */
export async function findPendingRequestByTicket(ticketId: string) {
  return prisma.planChangeRequest.findFirst({
    where: { ticketId, status: "PENDING" },
    include: { member: true },
  });
}

/** Findet den offenen Antrag einer Person - falls der Befehl ausserhalb des Tickets genutzt wird. */
export async function findPendingRequestByDiscordId(discordId: string) {
  return prisma.planChangeRequest.findFirst({
    where: { status: "PENDING", member: { discordId } },
    include: { member: true },
  });
}
