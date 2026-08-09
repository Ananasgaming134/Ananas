import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN } from "@/lib/discord";
import { LOAN_STATUS, SITE_NAME } from "@/lib/constants";

const DISCORD_API = "https://discord.com/api/v10";

function authHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function buildPanelPayload() {
  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
    take: 25, // Discord-Select-Menues erlauben maximal 25 Optionen
    include: { category: true },
  });
  const activeLoans = await prisma.loan.groupBy({
    by: ["itemId"],
    where: { status: LOAN_STATUS.ACTIVE },
    _count: { itemId: true },
  });
  const activeByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));

  const lines = items.map((item) => {
    const borrowed = activeByItem.get(item.id) ?? 0;
    const available = item.quantityTotal - borrowed;
    const icon = available > 0 ? "🟢" : "🔴";
    return `${icon} **${item.name}** — ${available}/${item.quantityTotal} frei`;
  });

  const description =
    lines.length > 0
      ? lines.join("\n")
      : "Aktuell sind keine Items hinterlegt.";

  const embed = {
    title: `📦 ${SITE_NAME} — Item-Übersicht`,
    description,
    color: 0xf2b544,
    footer: { text: "Wähle unten ein Item aus, um es auszuleihen oder zurückzugeben." },
    timestamp: new Date().toISOString(),
  };

  const components =
    items.length > 0
      ? [
          {
            type: 1, // Action Row
            components: [
              {
                type: 3, // String Select
                custom_id: "leihcenter_select_item",
                placeholder: "Item auswählen...",
                options: items.slice(0, 25).map((item) => ({
                  label: item.name.slice(0, 100),
                  value: item.id,
                  description: item.category?.name.slice(0, 100),
                })),
              },
            ],
          },
        ]
      : [];

  return { embeds: [embed], components };
}

/**
 * Baut das Status-Panel: alle aktuell ausgeliehenen Items mit Discord-
 * nativem Live-Timestamp (<t:unix:R>). Discord rendert diesen Timestamp im
 * Client jeder Person automatisch live/tickend ("vor 3 Stunden") - wir
 * muessen die Nachricht dafuer NICHT staendig neu editieren, nur wenn sich
 * tatsaechlich etwas ausleiht/zurueckkommt.
 */
async function buildStatusPanelPayload() {
  const activeLoans = await prisma.loan.findMany({
    where: { status: LOAN_STATUS.ACTIVE },
    include: { item: true, member: true },
    orderBy: { borrowedAt: "asc" },
  });

  const lines = activeLoans.map((loan) => {
    const unixSeconds = Math.floor(loan.borrowedAt.getTime() / 1000);
    return `📦 **${loan.item.name}** — ${loan.member.displayName} · seit <t:${unixSeconds}:R>`;
  });

  const embed = {
    title: `📋 ${SITE_NAME} — Aktuell ausgeliehen`,
    description: lines.length > 0 ? lines.join("\n") : "Aktuell ist nichts ausgeliehen.",
    color: 0x3ddc97,
    footer: { text: `${activeLoans.length} aktive Ausleihe(n)` },
    timestamp: new Date().toISOString(),
  };

  return { embeds: [embed] };
}

type PostResult = { ok: true } | { ok: false; error: string };

/** Postet eine Nachricht neu oder editiert eine vorhandene (per Message-ID) in einem Kanal. */
async function postOrUpdateMessage(
  channelId: string,
  existingMessageId: string | null,
  payload: unknown
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (existingMessageId) {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${existingMessageId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, messageId: existingMessageId };
    // Nachricht existiert nicht mehr (z.B. geloescht) -> neu posten.
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Discord antwortete mit ${res.status}: ${text.slice(0, 200)}` };
  }

  const message = (await res.json()) as { id: string };
  return { ok: true, messageId: message.id };
}

/**
 * Postet das Browse-/Ausleih-Panel neu oder aktualisiert die vorhandene
 * Nachricht (editiert statt neu zu posten, wie gewuenscht). Wird sowohl
 * nach Web-Aktionen (Ausleihen/Zurueckgeben/Item-Aenderung) als auch nach
 * Bot-Interaktionen aufgerufen. Rein REST-basiert (kein Gateway/
 * Dauerprozess noetig). Pflegt zusaetzlich das optionale Status-Panel mit
 * den aktuell ausgeliehenen Items, falls ein statusChannelId hinterlegt ist.
 */
export async function postOrUpdatePanel(deploymentId: string): Promise<PostResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || !deployment.active) return { ok: false, error: "Deployment nicht gefunden." };

  const payload = await buildPanelPayload();
  const result = await postOrUpdateMessage(deployment.channelId, deployment.panelMessageId, payload);

  if (result.ok && result.messageId !== deployment.panelMessageId) {
    await prisma.botDeployment.update({
      where: { id: deploymentId },
      data: { panelMessageId: result.messageId },
    });
  }
  if (!result.ok) return result;

  if (deployment.statusChannelId) {
    const statusPayload = await buildStatusPanelPayload();
    const statusResult = await postOrUpdateMessage(
      deployment.statusChannelId,
      deployment.statusMessageId,
      statusPayload
    );
    if (statusResult.ok && statusResult.messageId !== deployment.statusMessageId) {
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: { statusMessageId: statusResult.messageId },
      });
    }
    if (!statusResult.ok) return statusResult;
  }

  return { ok: true };
}

/** Aktualisiert alle aktiven Panels - nach jeder Aenderung an Items/Ausleihen aufrufen. */
export async function refreshAllPanels(): Promise<void> {
  if (!DISCORD_BOT_TOKEN) return;
  const deployments = await prisma.botDeployment.findMany({ where: { active: true } });
  await Promise.all(deployments.map((d) => postOrUpdatePanel(d.id)));
}

/** Wie refreshAllPanels(), schluckt aber Fehler - Panels sind ein Zusatz und
 * duerfen die eigentliche Web-Aktion nie scheitern lassen. */
export async function refreshPanelsQuietly(): Promise<void> {
  try {
    await refreshAllPanels();
  } catch {
    // bewusst ignoriert
  }
}
