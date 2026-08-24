import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { DISCORD_BOT_TOKEN, DISCORD_PAYMENTS_CHANNEL_ID, sendDiscordDirectMessage } from "@/lib/discord";
import { MEMBER_STATUS, SITE_URL, formatCoins } from "@/lib/constants";

type DiscordEmbed = {
  title?: string;
  description?: string;
  author?: { name?: string };
};

type DiscordMessage = {
  id: string;
  timestamp: string;
  embeds?: DiscordEmbed[];
};

type ParsedPayment = { amount: number; username: string; reason: string | null };

/**
 * Wertet eine Business-Card-Embed-Nachricht des "Saftiges System"-Bots aus.
 * Es gibt zwei Titel-Varianten fuer eingehendes Geld ("Überweisung erhalten"
 * von Person-zu-Person, "Von Business Card erhalten" von Karte-zu-Karte) -
 * beide im selben Kanal, beide relevant. Ausgehende Buchungen, Sperren/
 * Entsperrungen etc. haben andere Titel und werden hier bewusst NICHT
 * erkannt (liefert null).
 */
export function parsePaymentEmbed(embed: DiscordEmbed): ParsedPayment | null {
  const title = embed.title ?? "";
  const isIncoming = title.includes("Überweisung erhalten") || title.includes("Von Business Card erhalten");
  if (!isIncoming) return null;

  const description = embed.description ?? "";
  // Betraege ab 1000 formatiert der Bot mit "." als Tausendertrennzeichen
  // (z.B. "+1.000 ₵") - deshalb Ziffern UND Punkte zulassen und die Punkte
  // vor dem Parsen entfernen.
  const amountMatch = description.match(/\*\*\+([\d.]+)\s*₵\*\*/);
  if (!amountMatch) return null;
  const amount = parseInt(amountMatch[1].replace(/\./g, ""), 10);

  const senderLine = description.split("\n").find((l) => /\bvon\b/i.test(l));
  if (!senderLine) return null;

  const afterVon = senderLine.split(/\bvon\b/i).pop()?.trim() ?? "";
  if (!afterVon) return null;

  const colonIdx = afterVon.indexOf(":");
  const username = (colonIdx === -1 ? afterVon : afterVon.slice(0, colonIdx)).trim();
  const reason = colonIdx === -1 ? null : afterVon.slice(colonIdx + 1).trim() || null;
  if (!username) return null;

  return { amount, username, reason };
}

type CheckResult = { ok: true; found: number } | { ok: false; error: string };

/**
 * Holt die letzten Nachrichten aus dem Zahlungskanal, erkennt eingehende
 * Business-Card-Zahlungen und legt dafuer - falls noch nicht vorhanden -
 * einen Payment-Datensatz an (dedupliziert per Discord-Nachrichten-ID).
 * Ordnet die Zahlung primaer ueber die Kundennummer im Verwendungszweck
 * ("Verleih <Kundennummer>") einem Mitglied zu, fallback auf den
 * Discord-Username des Absenders, und schreibt sie sofort als Guthaben gut
 * (siehe creditPaymentCore). WEIST ABER NIE automatisch einen Abo-Plan zu -
 * das Abbuchen eines Pakets vom Guthaben passiert getrennt ueber
 * /verlaengern bzw. "Abo zuweisen" in der Verwaltung.
 */
export async function checkForNewPayments(): Promise<CheckResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };
  if (!DISCORD_PAYMENTS_CHANNEL_ID) return { ok: false, error: "Kein Zahlungskanal konfiguriert." };

  const res = await fetch(
    `https://discord.com/api/v10/channels/${DISCORD_PAYMENTS_CHANNEL_ID}/messages?limit=50`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Discord antwortete mit ${res.status}: ${text.slice(0, 200)}` };
  }

  const messages = (await res.json()) as DiscordMessage[];
  let found = 0;

  for (const message of messages) {
    const embed = message.embeds?.[0];
    if (!embed) continue;

    const parsed = parsePaymentEmbed(embed);
    if (!parsed) continue;

    const existing = await prisma.payment.findUnique({ where: { discordMessageId: message.id } });
    if (existing) continue;

    // Bevorzugtes Matching: Verwendungszweck "Verleih <Kundennummer>" - das
    // funktioniert auch, wenn jemand fuer eine andere Person ueberweist.
    // Fallback: Discord-Username des Absenders (schwaecheres Signal, aber
    // nichts wird automatisch angewendet, Aufsicht/Owner pruefen ohnehin
    // jede Zahlung manuell nach).
    const customerNumberMatch = parsed.reason?.match(/verleih\s*(\d{4,})/i);
    const member = customerNumberMatch
      ? await prisma.member.findUnique({ where: { customerNumber: customerNumberMatch[1] } })
      : await prisma.member.findFirst({ where: { username: { equals: parsed.username } } });

    const payment = await prisma.payment.create({
      data: {
        discordMessageId: message.id,
        amount: parsed.amount,
        discordUsername: parsed.username,
        reason: parsed.reason,
        receivedAt: new Date(message.timestamp),
        memberId: member?.id ?? null,
      },
    });
    found += 1;

    await logAction({
      targetId: member?.id ?? null,
      action: "PAYMENT_DETECTED",
      details: member
        ? `Zahlung von ${parsed.amount} ₵ von @${parsed.username} erkannt und ${member.displayName} zugeordnet.`
        : `Zahlung von ${parsed.amount} ₵ von @${parsed.username} erkannt - kein passendes Mitglied gefunden.`,
    });

    // Sofort verbuchen - ohne Klick in der Verwaltung.
    await creditPaymentCore(payment.id, null).catch((err) =>
      console.error("[zahlungen] Automatisches Verbuchen fehlgeschlagen:", err)
    );
  }

  return { ok: true, found };
}

export type CreditResult =
  | { ok: true; outcome: "APPLIED" | "DONATED" | "PENDING" }
  | { ok: false; error: string };

/**
 * Verbucht eine erkannte Zahlung. Wird sowohl automatisch (direkt nach dem
 * Erkennen im Zahlungskanal) als auch manuell aus der Verwaltung aufgerufen -
 * actorId ist dabei null bzw. die handelnde Person.
 *
 * Regel: Guthaben aufladen koennen nur aktive Kunden. Zahlungen von
 * Mitgliedern ohne aktiven Status zaehlen als Spende und erhoehen kein
 * Guthaben. Laesst sich die Zahlung keinem Mitglied zuordnen, bleibt sie
 * offen (PENDING) und wartet auf eine Zuordnung von Hand.
 */
export async function creditPaymentCore(
  paymentId: string,
  actorId: string | null
): Promise<CreditResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { member: true },
  });
  if (!payment) return { ok: false, error: "Zahlung nicht gefunden." };
  if (payment.status !== "PENDING") return { ok: false, error: "Zahlung wurde bereits verbucht." };

  // Ohne zugeordnetes Mitglied bleibt die Zahlung offen - dann entscheidet
  // die Verwaltung von Hand, zu wem sie gehoert.
  if (!payment.memberId || !payment.member) return { ok: true, outcome: "PENDING" };

  if (payment.member.status !== MEMBER_STATUS.ACTIVE) {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "DONATED" } });
    await logAction({
      actorId,
      targetId: payment.memberId,
      action: "PAYMENT_DONATED",
      details: `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) als Spende verbucht - kein aktiver Kunde.`,
    });
    return { ok: true, outcome: "DONATED" };
  }

  const updated = await prisma.member.update({
    where: { id: payment.memberId },
    data: { balance: { increment: payment.amount } },
  });
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "APPLIED" } });

  await logAction({
    actorId,
    targetId: payment.memberId,
    action: "PAYMENT_CREDITED",
    details: `Zahlung von ${payment.amount} ₵ (@${payment.discordUsername}) als Guthaben gutgeschrieben.`,
  });

  await sendDiscordDirectMessage(payment.member.discordId, {
    embeds: [
      {
        title: "💳 Guthaben aufgeladen",
        description:
          `Deine Zahlung ist angekommen und wurde deinem Konto gutgeschrieben.

` +
          `**Gutgeschrieben:** ${formatCoins(payment.amount)}
` +
          `**Neues Guthaben:** ${formatCoins(updated.balance)}

` +
          `Mit \`/verlaengern\` schließt du dein Abo direkt vom Guthaben ab — auch mit einem anderen Tarif. ` +
          `Deinen Stand siehst du jederzeit mit \`/guthaben\` oder auf ${SITE_URL}/dashboard/abo.`,
        color: 0x2f8f5b,
      },
    ],
  }).catch(() => {});

  return { ok: true, outcome: "APPLIED" };
}
