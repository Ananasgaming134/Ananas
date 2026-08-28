import type { Member } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  ABO_CHANNEL_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_SUBSCRIPTION_CHANNEL_ID,
  sendDiscordDirectMessage,
} from "@/lib/discord";
import {
  MAX_SUBSCRIPTION_AHEAD_MONTHS,
  addPlanDuration,
  SITE_NAME,
  SUBSCRIPTION_PLANS,
  exceedsMaxSubscription,
  formatCoins,
  getSubscriptionPlan,
  subscriptionEndAfter,
  type SubscriptionPlan,
} from "@/lib/constants";

export const RENEW_PREFIX = "leihcenter_renew:";

export type BalanceActionResult = { ok: true; newBalance: number } | { ok: false; error: string };

/**
 * Manuelle Guthaben-Buchung durch die Führungsebene (nur Owner, siehe
 * Berechtigungspruefung im Aufrufer) - unabhaengig von der automatischen
 * Zahlungserkennung (creditPaymentToBalance in src/lib/payments.ts). Deckt
 * Faelle ab, in denen eine Zahlung nicht automatisch erkannt wurde, oder
 * Korrekturen/Boni. amount kann negativ sein, um eine fehlerhafte Buchung
 * zu korrigieren - das grundsaetzliche "kein Rueckueberweisen"-Prinzip gilt
 * trotzdem, das hier ist eine interne Korrektur, keine Auszahlung an den Kunden.
 */
export async function adjustBalanceCore(
  memberId: string,
  amount: number,
  reason: string,
  actorId: string
): Promise<BalanceActionResult> {
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: "Ungültiger Betrag." };

  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };

  const updated = await prisma.member.update({
    where: { id: memberId },
    data: { balance: { increment: amount } },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "BALANCE_ADJUSTED",
    details: `Guthaben manuell ${amount > 0 ? "aufgeladen" : "korrigiert"} um ${formatCoins(amount)} (${reason}) - neuer Stand: ${formatCoins(updated.balance)}.`,
  });

  return { ok: true, newBalance: updated.balance };
}

type SetSubscriptionResult =
  | { ok: true; plan: SubscriptionPlan; newExpiry: Date }
  | { ok: false; error: string };

/**
 * Bucht den Preis eines Pakets vom Guthaben (member.balance) ab und
 * verlaengert das Abo entsprechend (haengt bei laufender Laufzeit an das
 * bestehende feePaidUntil an, statt ab heute zu zaehlen). Schlaegt fehl,
 * wenn nicht genug Guthaben vorhanden ist - Guthaben kommt ausschliesslich
 * ueber creditPaymentToBalance (src/lib/payments.ts) rein, es gibt keine
 * automatische Zuordnung. Wird sowohl von der Web-Aktion (setSubscriptionPlan)
 * als auch vom Verlaengern-Button im Discord-Abo-Kanal aufgerufen.
 */
export async function setSubscriptionPlanCore(
  memberId: string,
  planId: string,
  actorId: string | null,
  /**
   * Vom Team gewaehrt, ohne Guthaben abzubuchen - z.B. als Ausgleich, als
   * Sonderdeal oder fuer Teamler. Selbstbedienung setzt das nie.
   */
  optionen: { ohneAbbuchung?: boolean } = {}
): Promise<SetSubscriptionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (target.lockedAt) {
    return { ok: false, error: "Abo ist gesperrt - keine Verlängerung möglich (läuft nur bis zum bezahlten Ende aus)." };
  }

  const plan = getSubscriptionPlan(planId);
  if (!plan) return { ok: false, error: "Unbekannter Abo-Plan." };

  // Niemand soll sich durch mehrfaches Verlaengern Jahre im Voraus sichern.
  if (exceedsMaxSubscription(plan, target.feePaidUntil)) {
    const ende = subscriptionEndAfter(plan, target.feePaidUntil);
    const laeuftBis = target.feePaidUntil?.toLocaleDateString("de-DE");
    return {
      ok: false,
      error:
        `Damit würde dein Abo bis ${ende.toLocaleDateString("de-DE")} laufen — weiter als ` +
        `${MAX_SUBSCRIPTION_AHEAD_MONTHS} Monate im Voraus geht nicht.` +
        (laeuftBis ? ` Dein Abo läuft aktuell bis ${laeuftBis}; nimm ein kürzeres Paket oder verlängere später.` : ""),
    };
  }

  if (!optionen.ohneAbbuchung && target.balance < plan.price) {
    return {
      ok: false,
      error: `Nicht genug Guthaben (aktuell ${formatCoins(target.balance)}, benötigt ${formatCoins(plan.price)}).`,
    };
  }

  const now = new Date();
  const base = target.feePaidUntil && target.feePaidUntil > now ? target.feePaidUntil : now;
  const newExpiry = addPlanDuration(new Date(base), plan);

  await prisma.member.update({
    where: { id: memberId },
    data: {
      subscriptionPlan: plan.id,
      monthlyFee: plan.price,
      feePaidUntil: newExpiry,
      subscriptionReminderSentAt: null,
      ...(optionen.ohneAbbuchung ? {} : { balance: { decrement: plan.price } }),
      // Abo steht - die Zahlungsfrist nach der Rollenvergabe ist damit
      // erfuellt und darf nicht mehr zum Rollenentzug fuehren.
      graceUntil: null,
      graceReminderSentAt: null,
      // Neue Laufzeit: Ablauf-Benachrichtigungen duerfen wieder rausgehen.
      expiryDmSentAt: null,
      subscriptionAnnouncedAt: null,
    },
  });

  // Abo-Kanal informieren (Start + voraussichtliches Ende).
  await announceSubscription(memberId, plan, newExpiry).catch(() => {});

  await logAction({
    actorId,
    targetId: memberId,
    action: optionen.ohneAbbuchung ? "SUBSCRIPTION_GRANTED" : "SUBSCRIPTION_CHARGED",
    details: optionen.ohneAbbuchung
      ? `Abo "${plan.label}" ohne Abbuchung gewährt, gültig bis ${newExpiry.toLocaleDateString("de-DE")}.`
      : `Abo "${plan.label}" (${formatCoins(plan.price)}) vom Guthaben abgebucht, gültig bis ${newExpiry.toLocaleDateString("de-DE")}.`,
  });

  return { ok: true, plan, newExpiry };
}

/**
 * Freies Abo nach Mass: Betrag und Laufzeit gibt das Team selbst vor, statt
 * eines der festen Pakete zu nehmen. Fuer Sonderabsprachen, Ausgleiche und
 * Teamler-Konditionen. Die Sechs-Monats-Grenze gilt auch hier.
 */
export async function setCustomSubscriptionCore(
  memberId: string,
  betrag: number,
  tage: number,
  actorId: string,
  optionen: { ohneAbbuchung?: boolean } = {}
): Promise<SetSubscriptionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (!Number.isFinite(tage) || tage < 1) return { ok: false, error: "Bitte eine Laufzeit ab 1 Tag angeben." };
  if (!Number.isFinite(betrag) || betrag < 0) return { ok: false, error: "Der Betrag darf nicht negativ sein." };

  const preis = Math.round(betrag);
  const dauer = Math.round(tage);

  if (!optionen.ohneAbbuchung && target.balance < preis) {
    return {
      ok: false,
      error: `Nicht genug Guthaben (aktuell ${formatCoins(target.balance)}, benötigt ${formatCoins(preis)}).`,
    };
  }

  const plan: SubscriptionPlan = {
    id: "CUSTOM",
    label: `${dauer} Tag${dauer === 1 ? "" : "e"} (individuell)`,
    price: preis,
    days: dauer,
  };

  if (exceedsMaxSubscription(plan, target.feePaidUntil)) {
    const ende = subscriptionEndAfter(plan, target.feePaidUntil);
    return {
      ok: false,
      error: `Damit würde das Abo bis ${ende.toLocaleDateString("de-DE")} laufen — weiter als ${MAX_SUBSCRIPTION_AHEAD_MONTHS} Monate im Voraus geht nicht.`,
    };
  }

  const now = new Date();
  const base = target.feePaidUntil && target.feePaidUntil > now ? target.feePaidUntil : now;
  const newExpiry = addPlanDuration(new Date(base), plan);

  await prisma.member.update({
    where: { id: memberId },
    data: {
      subscriptionPlan: plan.id,
      monthlyFee: preis,
      feePaidUntil: newExpiry,
      subscriptionReminderSentAt: null,
      ...(optionen.ohneAbbuchung ? {} : { balance: { decrement: preis } }),
      graceUntil: null,
      graceReminderSentAt: null,
      expiryDmSentAt: null,
      subscriptionAnnouncedAt: null,
    },
  });

  await announceSubscription(memberId, plan, newExpiry).catch(() => {});

  await logAction({
    actorId,
    targetId: memberId,
    action: optionen.ohneAbbuchung ? "SUBSCRIPTION_GRANTED" : "SUBSCRIPTION_CHARGED",
    details:
      `Individuelles Abo: ${dauer} Tag${dauer === 1 ? "" : "e"} für ${formatCoins(preis)}` +
      (optionen.ohneAbbuchung ? " (ohne Abbuchung)" : " vom Guthaben abgebucht") +
      `, gültig bis ${newExpiry.toLocaleDateString("de-DE")}.`,
  });

  return { ok: true, plan, newExpiry };
}

/**
 * Selbstbedienung fuer Kunden: Abo abschliessen oder verlaengern - mit dem
 * bisherigen Paket ODER einem anderen Tarif. Reicht das Guthaben, wird sofort
 * abgebucht und die Laufzeit verlaengert; eine Freigabe braucht es nicht.
 *
 * Der Antrag ueber ein Ticket (requestPlanChangeCore) bleibt zusaetzlich
 * bestehen - fuer Faelle, in denen das Guthaben noch nicht reicht oder die
 * Zahlung ausserhalb der Business-Card abgewickelt werden soll.
 */
export async function renewOwnSubscriptionCore(
  memberId: string,
  planId: string
): Promise<SetSubscriptionResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { ok: false, error: "Mitglied nicht gefunden." };

  return setSubscriptionPlanCore(memberId, planId, memberId);
}

/**
 * Meldet einen frisch abgeschlossenen bzw. verlaengerten Abo-Zeitraum im
 * Abo-Kanal: wer, welches Paket, ab wann und bis wann. Best-effort - schlaegt
 * die Meldung fehl, bleibt das Abo trotzdem gueltig.
 */
export async function announceSubscription(
  memberId: string,
  plan: SubscriptionPlan,
  newExpiry: Date
): Promise<void> {
  if (!DISCORD_BOT_TOKEN || !ABO_CHANNEL_ID) return;

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return;

  const startUnix = Math.floor(Date.now() / 1000);
  const endUnix = Math.floor(newExpiry.getTime() / 1000);

  await fetch(`https://discord.com/api/v10/channels/${ABO_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: "✅ Abo abgeschlossen",
          description: `<@${member.discordId}> — **${plan.label}**`,
          color: 0x3ddc97,
          fields: [
            { name: "Preis", value: formatCoins(plan.price), inline: true },
            { name: "Beginn", value: `<t:${startUnix}:d>`, inline: true },
            { name: "Läuft bis", value: `<t:${endUnix}:d> (<t:${endUnix}:R>)`, inline: true },
          ],
          footer: { text: `Kundennummer ${member.customerNumber ?? "-"}` },
        },
      ],
      allowed_mentions: { parse: [] },
    }),
  }).catch(() => {});

  await prisma.member.update({
    where: { id: memberId },
    data: { subscriptionAnnouncedAt: new Date() },
  }).catch(() => {});
}

/**
 * Laeuft per Cron: benachrichtigt einen Tag vor Ablauf sowohl den Kunden per
 * DM als auch den Abo-Kanal, damit das Team nachfassen kann. Geht pro
 * Laufzeit nur einmal raus (expiryDmSentAt wird bei jeder Verlaengerung
 * zurueckgesetzt).
 */
export async function sendExpiryNotices(): Promise<{ sent: number }> {
  const now = new Date();
  const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      pausedAt: null,
      feePaidUntil: { not: null, gt: now, lte: inOneDay },
      expiryDmSentAt: null,
    },
  });

  let sent = 0;
  for (const member of due) {
    if (!member.feePaidUntil) continue;
    const unix = Math.floor(member.feePaidUntil.getTime() / 1000);
    const plan = getSubscriptionPlan(member.subscriptionPlan);
    const enough = plan ? member.balance >= plan.price : false;

    await sendDiscordDirectMessage(member.discordId, {
      embeds: [
        {
          title: "⏰ Dein Abo läuft bald ab",
          description: [
            `Dein Abo **${plan?.label ?? "—"}** endet <t:${unix}:R> (<t:${unix}:F>).`,
            "",
            enough
              ? `Dein Guthaben (**${formatCoins(member.balance)}**) reicht für die Verlängerung — einfach \`/abo verlaengern\` hier in Discord oder auf der Website unter „Abo“.`
              : [
                  `Dein Guthaben beträgt **${formatCoins(member.balance)}**, die Verlängerung kostet **${formatCoins(plan?.price ?? 0)}**.`,
                  "",
                  `Lade auf die Business-Card **BC-584289** auf, Verwendungszweck \`Verleih ${member.customerNumber ?? "<Kundennummer>"}\`.`,
                  "Lieber ohne Business-Card? Mach ein Ticket auf, dann geht es auch direkt.",
                ].join("\n"),
            "",
            "Läuft das Abo ab, verlierst du die Kunden-Rolle und kannst nichts mehr ausleihen.",
          ].join("\n"),
          color: 0xf2b544,
        },
      ],
    }).catch(() => {});

    if (DISCORD_BOT_TOKEN && ABO_CHANNEL_ID) {
      await fetch(`https://discord.com/api/v10/channels/${ABO_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: "⏰ Abo läuft morgen ab",
              description:
                `<@${member.discordId}> — **${plan?.label ?? "—"}** endet <t:${unix}:R>.\n` +
                `Guthaben: **${formatCoins(member.balance)}**${enough ? " (reicht zum Verlängern)" : " — reicht noch nicht"}\n\n` +
                "Bitte einmal nachfragen, ob verlängert werden soll.",
              color: enough ? 0xf2b544 : 0xf2545b,
              footer: { text: `Kundennummer ${member.customerNumber ?? "-"}` },
            },
          ],
          allowed_mentions: { parse: [] },
        }),
      }).catch(() => {});
    }

    await prisma.member.update({ where: { id: member.id }, data: { expiryDmSentAt: now } });
    sent += 1;
  }

  return { sent };
}

export type PauseActionResult = { ok: true } | { ok: false; error: string };

/**
 * "Sperren" (nur Owner, siehe UI-Gate): anders als Bann/Freigabe-Entzug KEIN
 * sofortiger Ausschluss - das Abo laeuft nur noch bis zum bereits bezahlten
 * feePaidUntil aus, danach keine weitere Verlaengerung mehr moeglich
 * (setSubscriptionPlanCore lehnt das oben ab). Verschickt sofort die
 * Dauerauftrag-Warnung per DM und haelt den Zeitpunkt fest
 * (lockNoticeSentAt), damit isRefundEligible() spaeter die 24h-Regel
 * anwenden kann.
 */
export async function lockMemberCore(memberId: string, reason: string, actorId: string): Promise<PauseActionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (target.lockedAt) return { ok: false, error: "Abo ist bereits gesperrt." };

  const now = new Date();
  await prisma.member.update({
    where: { id: memberId },
    data: { lockedAt: now, lockReason: reason, lockedById: actorId, lockNoticeSentAt: now },
  });

  const expiryLine = target.feePaidUntil
    ? `Dein aktuelles Abo läuft noch bis ${target.feePaidUntil.toLocaleDateString("de-DE")} und wird danach NICHT mehr verlängert.`
    : "Dein Abo wird nicht mehr verlängert.";

  await sendDiscordDirectMessage(target.discordId, {
    content:
      `⚠️ **${SITE_NAME} — Abo gesperrt**\nGrund: ${reason}\n\n${expiryLine}\n\n` +
      "Falls du einen Dauerauftrag für die Abo-Zahlung eingerichtet hast, brich ihn bitte ab. " +
      "Eine danach trotzdem eingehende Zahlung wird sonst als Spende gewertet und nicht erstattet.",
  }).catch(() => {});

  await logAction({ actorId, targetId: memberId, action: "SUBSCRIPTION_LOCKED", details: `Abo gesperrt: ${reason}` });
  return { ok: true };
}

export async function unlockMemberCore(memberId: string, actorId: string): Promise<PauseActionResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (!target.lockedAt) return { ok: false, error: "Abo ist aktuell nicht gesperrt." };

  await prisma.member.update({
    where: { id: memberId },
    data: { lockedAt: null, lockReason: null, lockedById: null, lockNoticeSentAt: null },
  });

  await logAction({ actorId, targetId: memberId, action: "SUBSCRIPTION_UNLOCKED", details: "Abo-Sperre aufgehoben." });
  return { ok: true };
}

/**
 * 24h-Regel: wurde die Dauerauftrag-Warnung WENIGER als 24h vor dem
 * bezahlten Laufzeitende verschickt (oder erst danach), hatte die Person
 * nicht genug Vorlauf - eine trotzdem eingehende Zahlung muss dann erstattet
 * werden. Bei >=24h Vorlauf gilt sie als Spende (keine Erstattung faellig).
 */
export function isRefundEligible(member: Pick<Member, "lockNoticeSentAt" | "feePaidUntil">): boolean {
  if (!member.lockNoticeSentAt) return false;
  if (!member.feePaidUntil) return true;
  const noticeLeadMs = member.feePaidUntil.getTime() - member.lockNoticeSentAt.getTime();
  return noticeLeadMs < 24 * 60 * 60 * 1000;
}

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

  // Wochen-Pakete lassen sich nicht pausieren - bei sieben Tagen Laufzeit
  // waere das nur Verwaltungsaufwand ohne Nutzen. Steht so auch auf der
  // Paket-Karte, deshalb hier auch wirklich verhindern.
  const laufendesPaket = getSubscriptionPlan(target.subscriptionPlan);
  if (laufendesPaket?.days) {
    return {
      ok: false,
      error: `Das Paket „${laufendesPaket.label}" lässt sich nicht pausieren - das geht erst ab einem Monat Laufzeit.`,
    };
  }

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
