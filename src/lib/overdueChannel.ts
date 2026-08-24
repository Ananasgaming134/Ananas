import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN, OVERDUE_CHANNEL_ID } from "@/lib/discord";
import { SITE_URL } from "@/lib/constants";

type OverdueLoan = {
  id: string;
  borrowedAt: Date;
  dueAt: Date | null;
  overdueMessageId: string | null;
  item: { name: string };
  member: { discordId: string; displayName: string; minecraftName: string | null };
};

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Baut die Meldung fuer den Ueberzieh-Kanal. Dieselbe Nachricht durchlaeuft
 * drei Zustaende - ueberzogen, gesperrt, zurueckgegeben - damit die Aufsicht
 * eine Zeile pro Vorfall sieht statt drei einzelner Meldungen.
 */
function buildEmbed(loan: OverdueLoan, state: "overdue" | "suspended" | "returned", returnedAt?: Date) {
  const spieler = loan.member.minecraftName
    ? `${loan.member.displayName} (\`${loan.member.minecraftName}\`)`
    : loan.member.displayName;

  const fields = [
    { name: "Item", value: loan.item.name, inline: true },
    { name: "Person", value: `<@${loan.member.discordId}>`, inline: true },
    { name: "Minecraft", value: loan.member.minecraftName ?? "nicht verifiziert", inline: true },
    { name: "Ausgeliehen", value: `<t:${unix(loan.borrowedAt)}:t>`, inline: true },
    {
      name: "Frist war",
      value: loan.dueAt ? `<t:${unix(loan.dueAt)}:t> (<t:${unix(loan.dueAt)}:R>)` : "—",
      inline: true,
    },
  ];

  if (state === "returned" && returnedAt) {
    fields.push({ name: "Zurückgegeben", value: `<t:${unix(returnedAt)}:t>`, inline: true });
    return {
      title: "✅ Überziehung erledigt",
      description: `**${spieler}** hat **"${loan.item.name}"** zurückgegeben.`,
      color: 0x3ddc97,
      fields,
    };
  }

  if (state === "suspended") {
    return {
      title: "🚫 Über 15 Minuten überzogen — Ausleih-Sperre",
      description:
        `**${spieler}** hat **"${loan.item.name}"** um mehr als 15 Minuten überzogen. ` +
        `Es wurde automatisch eine 2-Stunden-Ausleih-Sperre verhängt. Das Item ist **noch nicht zurück**.`,
      color: 0xf2545b,
      fields,
    };
  }

  return {
    title: "⏰ Ausleihfrist überzogen",
    description:
      `**${spieler}** hat die Frist für **"${loan.item.name}"** überschritten. ` +
      `Nach 15 Minuten Überziehung wird automatisch gesperrt.`,
    color: 0xf28b44,
    fields,
  };
}

async function channelFetch(path: string, init: RequestInit) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Meldet eine ueberzogene Ausleihe im Ueberzieh-Kanal und merkt sich die
 * Nachricht, damit spaetere Zustaende dieselbe Meldung bearbeiten koennen.
 */
export async function postOverdueNotice(loanId: string, state: "overdue" | "suspended"): Promise<void> {
  if (!DISCORD_BOT_TOKEN || !OVERDUE_CHANNEL_ID) return;

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      item: { select: { name: true } },
      member: { select: { discordId: true, displayName: true, minecraftName: true } },
    },
  });
  if (!loan) return;

  const payload = {
    content: state === "suspended" ? `<@${loan.member.discordId}> ist gesperrt.` : undefined,
    embeds: [buildEmbed(loan, state)],
    allowed_mentions: { users: [loan.member.discordId] },
  };

  // Beim Eskalieren wird die bestehende Meldung bearbeitet, nicht ergaenzt.
  if (loan.overdueMessageId) {
    const res = await channelFetch(
      `/channels/${OVERDUE_CHANNEL_ID}/messages/${loan.overdueMessageId}`,
      { method: "PATCH", body: JSON.stringify({ embeds: payload.embeds }) }
    );
    if (res.ok) return;
    // Nachricht wurde geloescht - dann eine neue posten.
  }

  const res = await channelFetch(`/channels/${OVERDUE_CHANNEL_ID}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[ueberzogen] Meldung fehlgeschlagen:", res.status, (await res.text()).slice(0, 200));
    return;
  }

  const message = (await res.json()) as { id?: string };
  if (message.id) {
    await prisma.loan.update({ where: { id: loanId }, data: { overdueMessageId: message.id } });
  }
}

/**
 * Schliesst eine offene Ueberzieh-Meldung ab, sobald das Item zurueck ist.
 * Tut nichts, wenn zu der Ausleihe nie eine Meldung gepostet wurde.
 */
export async function resolveOverdueNotice(loanId: string, returnedAt: Date): Promise<void> {
  if (!DISCORD_BOT_TOKEN || !OVERDUE_CHANNEL_ID) return;

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      item: { select: { name: true } },
      member: { select: { discordId: true, displayName: true, minecraftName: true } },
    },
  });
  if (!loan?.overdueMessageId) return;

  await channelFetch(`/channels/${OVERDUE_CHANNEL_ID}/messages/${loan.overdueMessageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      content: `Erledigt — Übersicht: ${SITE_URL}/dashboard/verwaltung/ausleihen`,
      embeds: [buildEmbed(loan, "returned", returnedAt)],
    }),
  }).catch((err) => console.error("[ueberzogen] Abschluss fehlgeschlagen:", err));
}
