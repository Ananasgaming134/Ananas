import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendDiscordDirectMessage } from "@/lib/discord";
import { SITE_NAME, SITE_URL, formatCoins } from "@/lib/constants";

export type DisziplinResult = { ok: true } | { ok: false; error: string };

/**
 * Sperrt die Ausleih-Rechte wegen eines Verstosses - unabhaengig davon, ob
 * ein Abo laeuft. Das Abo bleibt bestehen und laeuft weiter; nur ausleihen
 * geht nicht mehr, bis das Team die Sperre wieder aufhebt.
 *
 * Bewusst getrennt von der automatischen Sperre nach Ueberziehung
 * (borrowSuspendedUntil): die laeuft von selbst ab, diese hier nicht.
 */
export async function blockRightsCore(
  memberId: string,
  reason: string,
  actorId: string
): Promise<DisziplinResult> {
  const grund = reason.trim();
  if (!grund) return { ok: false, error: "Bitte einen Grund angeben - die Person bekommt ihn zu lesen." };

  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (target.rightsBlockedAt) return { ok: false, error: "Die Rechte sind bereits gesperrt." };

  await prisma.member.update({
    where: { id: memberId },
    data: { rightsBlockedAt: new Date(), rightsBlockReason: grund, rightsBlockedById: actorId },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "RIGHTS_BLOCKED",
    details: `Ausleih-Rechte gesperrt: ${grund}`,
  });

  await sendDiscordDirectMessage(target.discordId, {
    embeds: [
      {
        title: "🚫 Deine Ausleih-Rechte wurden gesperrt",
        description:
          `Das Team hat deine Rechte im ${SITE_NAME} gesperrt.\n\n` +
          `**Grund:** ${grund}\n\n` +
          `Dein Abo läuft normal weiter, aber du kannst vorerst nichts ausleihen. ` +
          `Die Sperre endet nicht von selbst — sie wird vom Team aufgehoben. ` +
          `Wenn du das für einen Irrtum hältst, eröffne bitte ein Support-Ticket.`,
        color: 0xf2545b,
      },
    ],
  }).catch(() => {});

  return { ok: true };
}

/** Hebt die Rechte-Sperre wieder auf und sagt der Person Bescheid. */
export async function unblockRightsCore(memberId: string, actorId: string): Promise<DisziplinResult> {
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };
  if (!target.rightsBlockedAt) return { ok: false, error: "Die Rechte sind gar nicht gesperrt." };

  await prisma.member.update({
    where: { id: memberId },
    data: { rightsBlockedAt: null, rightsBlockReason: null, rightsBlockedById: null },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "RIGHTS_UNBLOCKED",
    details: "Ausleih-Rechte wieder freigegeben.",
  });

  await sendDiscordDirectMessage(target.discordId, {
    embeds: [
      {
        title: "✅ Deine Ausleih-Rechte sind wieder frei",
        description: `Das Team hat die Sperre aufgehoben — du kannst wieder ausleihen.`,
        color: 0x3ddc97,
      },
    ],
  }).catch(() => {});

  return { ok: true };
}

/**
 * Verhaengt eine Geldstrafe. Bezahlt wird sie aus dem Guthaben: was da ist,
 * wird sofort einbehalten, der Rest bleibt offen und wird automatisch
 * abgezogen, sobald wieder Geld eingeht (siehe settleFinesFromBalance).
 */
export async function issueFineCore(
  memberId: string,
  amount: number,
  reason: string,
  actorId: string
): Promise<DisziplinResult> {
  const grund = reason.trim();
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Bitte einen Betrag über 0 angeben." };
  if (!grund) return { ok: false, error: "Bitte einen Grund angeben - die Person bekommt ihn zu lesen." };

  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return { ok: false, error: "Mitglied nicht gefunden." };

  const fine = await prisma.fine.create({
    data: { memberId, amount: Math.round(amount), reason: grund, issuedById: actorId },
  });

  const sofortBezahlt = await settleFinesFromBalance(memberId, actorId);
  const offen = Math.round(amount) - Math.min(Math.round(amount), sofortBezahlt);

  await logAction({
    actorId,
    targetId: memberId,
    action: "FINE_ISSUED",
    details:
      `Geldstrafe ${formatCoins(Math.round(amount))} verhängt: ${grund}` +
      (offen > 0 ? ` (davon ${formatCoins(offen)} noch offen)` : " (sofort vom Guthaben beglichen)"),
  });

  await sendDiscordDirectMessage(target.discordId, {
    embeds: [
      {
        title: "💸 Geldstrafe verhängt",
        description:
          `Das Team hat gegen dich eine Geldstrafe verhängt.\n\n` +
          `**Betrag:** ${formatCoins(Math.round(amount))}\n` +
          `**Grund:** ${grund}\n\n` +
          (offen > 0
            ? `Davon sind **${formatCoins(offen)} noch offen**. Der Betrag wird automatisch von deinem ` +
              `Guthaben abgezogen, sobald wieder etwas eingeht.`
            : `Der Betrag wurde direkt von deinem Guthaben abgezogen.`) +
          `\n\nDeinen Stand siehst du unter ${SITE_URL}/dashboard/abo.`,
        color: 0xf28b44,
        footer: { text: `Strafe ${fine.id.slice(-6)}` },
      },
    ],
  }).catch(() => {});

  return { ok: true };
}

/**
 * Begleicht offene Strafen aus dem vorhandenen Guthaben - so weit es reicht.
 * Wird beim Verhaengen aufgerufen und noch einmal, sobald eine Zahlung
 * gutgeschrieben wurde. Gibt zurueck, wie viel dabei verrechnet wurde.
 */
export async function settleFinesFromBalance(memberId: string, actorId: string | null = null): Promise<number> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.balance <= 0) return 0;

  const offeneStrafen = await prisma.fine.findMany({
    where: { memberId, paidAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (offeneStrafen.length === 0) return 0;

  let verfuegbar = member.balance;
  let verrechnet = 0;

  for (const strafe of offeneStrafen) {
    if (verfuegbar <= 0) break;
    const offen = strafe.amount - strafe.paidAmount;
    const zahlung = Math.min(offen, verfuegbar);

    await prisma.fine.update({
      where: { id: strafe.id },
      data: {
        paidAmount: strafe.paidAmount + zahlung,
        ...(strafe.paidAmount + zahlung >= strafe.amount ? { paidAt: new Date() } : {}),
      },
    });

    verfuegbar -= zahlung;
    verrechnet += zahlung;
  }

  if (verrechnet > 0) {
    await prisma.member.update({
      where: { id: memberId },
      data: { balance: { decrement: verrechnet } },
    });
    await logAction({
      actorId,
      targetId: memberId,
      action: "FINE_SETTLED",
      details: `${formatCoins(verrechnet)} vom Guthaben auf offene Geldstrafen verrechnet.`,
    });
  }

  return verrechnet;
}

/** Streicht eine Strafe - z.B. wenn sie zu Unrecht verhaengt wurde. */
export async function cancelFineCore(fineId: string, actorId: string): Promise<DisziplinResult> {
  const strafe = await prisma.fine.findUnique({ where: { id: fineId }, include: { member: true } });
  if (!strafe) return { ok: false, error: "Strafe nicht gefunden." };

  // Bereits einbehaltenes Geld geht zurueck aufs Guthaben.
  if (strafe.paidAmount > 0) {
    await prisma.member.update({
      where: { id: strafe.memberId },
      data: { balance: { increment: strafe.paidAmount } },
    });
  }
  await prisma.fine.delete({ where: { id: fineId } });

  await logAction({
    actorId,
    targetId: strafe.memberId,
    action: "FINE_CANCELLED",
    details:
      `Geldstrafe ${formatCoins(strafe.amount)} gestrichen` +
      (strafe.paidAmount > 0 ? `, ${formatCoins(strafe.paidAmount)} zurück aufs Guthaben.` : "."),
  });

  await sendDiscordDirectMessage(strafe.member.discordId, {
    embeds: [
      {
        title: "✅ Geldstrafe gestrichen",
        description:
          `Die Strafe über **${formatCoins(strafe.amount)}** wurde vom Team wieder gestrichen.` +
          (strafe.paidAmount > 0
            ? `\n\n**${formatCoins(strafe.paidAmount)}** sind zurück auf deinem Guthaben.`
            : ""),
        color: 0x3ddc97,
      },
    ],
  }).catch(() => {});

  return { ok: true };
}
