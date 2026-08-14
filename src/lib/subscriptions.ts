import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { DISCORD_BOT_TOKEN, DISCORD_SUBSCRIPTION_CHANNEL_ID } from "@/lib/discord";
import { formatCoins, getSubscriptionPlan, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/constants";

export const RENEW_PREFIX = "leihcenter_renew:";

type SetSubscriptionResult =
  | { ok: true; plan: SubscriptionPlan; newExpiry: Date }
  | { ok: false; error: string };

/**
 * Weist einem Kunden ein Abo zu bzw. verlaengert es (haengt bei laufender
 * Laufzeit an das bestehende feePaidUntil an, statt ab heute zu zaehlen).
 * Wird sowohl von der Web-Aktion (setSubscriptionPlan) als auch vom
 * Verlaengern-Button im Discord-Abo-Kanal aufgerufen.
 */
export async function setSubscriptionPlanCore(
  memberId: string,
  planId: string,
  actorId: string | null
): Promise<SetSubscriptionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };

  const plan = getSubscriptionPlan(planId);
  if (!plan) return { ok: false, error: "Unbekannter Abo-Plan." };

  const now = new Date();
  const base = target.feePaidUntil && target.feePaidUntil > now ? target.feePaidUntil : now;
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + plan.months);

  await prisma.member.update({
    where: { id: memberId },
    data: {
      subscriptionPlan: plan.id,
      monthlyFee: plan.price,
      feePaidUntil: newExpiry,
      subscriptionReminderSentAt: null,
    },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "SUBSCRIPTION_SET",
    details: `Abo "${plan.label}" (${formatCoins(plan.price)}) zugewiesen, gültig bis ${newExpiry.toLocaleDateString("de-DE")}.`,
  });

  return { ok: true, plan, newExpiry };
}

export type PauseActionResult = { ok: true } | { ok: false; error: string };

/**
 * Pausiert das Abo eines Mitglieds (z.B. nach einem Support-Ticket) - waehrend
 * der Pause bleibt der Status ACTIVE, aber borrowItemCore blockt neue
 * Ausleihen (siehe src/lib/loans.ts). Die Abrechnung passiert erst beim
 * Fortsetzen (resumeMemberCore), nicht hier.
 */
export async function pauseMemberCore(
  memberId: string,
  reason: string,
  actorId: string,
  ticketId: string | null
): Promise<PauseActionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (target.pausedAt) return { ok: false, error: "Abo ist bereits pausiert." };

  await prisma.member.update({
    where: { id: memberId },
    data: { pausedAt: new Date(), pauseReason: reason, pausedById: actorId, pauseTicketId: ticketId },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "SUBSCRIPTION_PAUSED",
    details: `Abo pausiert: ${reason}`,
  });

  return { ok: true };
}

/**
 * Beendet eine Abo-Pause und haengt die pausierte Zeit ans bestehende
 * feePaidUntil dran (Gutschrift statt Bar-Rueckerstattung, siehe Plan) - der
 * Kunde zahlt effektiv nicht fuer die Pausenzeit, verliert aber auch nichts.
 */
export async function resumeMemberCore(memberId: string, actorId: string): Promise<PauseActionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (!target.pausedAt) return { ok: false, error: "Abo ist aktuell nicht pausiert." };

  const pausedMs = Date.now() - target.pausedAt.getTime();
  const newFeePaidUntil = target.feePaidUntil
    ? new Date(target.feePaidUntil.getTime() + pausedMs)
    : target.feePaidUntil;

  await prisma.member.update({
    where: { id: memberId },
    data: {
      feePaidUntil: newFeePaidUntil,
      pausedAt: null,
      pauseReason: null,
      pausedById: null,
      pauseTicketId: null,
    },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "SUBSCRIPTION_RESUMED",
    details: `Abo-Pause beendet (${Math.round(pausedMs / (24 * 60 * 60 * 1000))} Tag(e)) - Frist entsprechend verlängert.`,
  });

  return { ok: true };
}

/**
 * Findet Kunden, deren Abo abgelaufen ist oder in den naechsten 3 Tagen
 * ablaeuft, und fuer deren AKTUELLE Laufzeit noch keine Erinnerung gepostet
 * wurde (subscriptionReminderSentAt wird bei jeder Verlaengerung zurueckgesetzt).
 */
async function findMembersNeedingReminder() {
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);

  return prisma.member.findMany({
    where: {
      feePaidUntil: { not: null, lt: soon },
      subscriptionReminderSentAt: null,
    },
  });
}

type ReminderResult = { ok: true; posted: number } | { ok: false; error: string };

/**
 * Postet fuer jeden faelligen Kunden eine Erinnerung mit Verlaengern-Buttons
 * (1/3/6 Monate) in den Discord-Abo-Kanal. Es gibt keinen echten Scheduler -
 * das muss aktuell manuell (Owner-Button) ausgeloest werden.
 */
export async function postSubscriptionReminders(): Promise<ReminderResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };
  if (!DISCORD_SUBSCRIPTION_CHANNEL_ID) return { ok: false, error: "Kein Abo-Kanal konfiguriert." };

  const members = await findMembersNeedingReminder();
  let posted = 0;

  for (const member of members) {
    const expired = !member.feePaidUntil || member.feePaidUntil < new Date();
    const statusLine = member.feePaidUntil
      ? expired
        ? `abgelaufen am ${member.feePaidUntil.toLocaleDateString("de-DE")}`
        : `läuft ab am ${member.feePaidUntil.toLocaleDateString("de-DE")}`
      : "kein Abo hinterlegt";

    const payload = {
      embeds: [
        {
          title: `⏰ Abo-Erinnerung — ${member.displayName}`,
          description: `Das Abo von **${member.displayName}** (@${member.username}) ${statusLine}.`,
          color: expired ? 0xf2545b : 0xf2b544,
          footer: { text: `Discord-ID: ${member.discordId}` },
        },
      ],
      components: [
        {
          type: 1,
          components: SUBSCRIPTION_PLANS.map((plan) => ({
            type: 2,
            style: 1,
            label: `${plan.label} – ${formatCoins(plan.price)}`,
            custom_id: `${RENEW_PREFIX}${member.id}:${plan.id}`,
          })),
        },
      ],
    };

    const res = await fetch(`https://discord.com/api/v10/channels/${DISCORD_SUBSCRIPTION_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Discord antwortete mit ${res.status}: ${text.slice(0, 200)}` };
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { subscriptionReminderSentAt: new Date() },
    });
    posted += 1;
  }

  return { ok: true, posted };
}
