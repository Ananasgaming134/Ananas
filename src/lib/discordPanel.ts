import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN } from "@/lib/discord";
import { LOAN_STATUS, SITE_NAME } from "@/lib/constants";
import {
  CATEGORY_ITEM_SELECT_ID,
  CATEGORY_PAGE_PREFIX,
  ITEM_SEARCH_PAGE_PREFIX,
  ITEM_SEARCH_SELECT_ID,
  NO_CATEGORY_VALUE,
  PANEL_SEARCH_BUTTON_ID,
  TICKET_OPEN_BEWERBUNG_ID,
  TICKET_OPEN_SUPPORT_ID,
} from "@/lib/discordInteractions";

const MAX_SELECT_OPTIONS = 25; // Discord-Select-Menues erlauben maximal 25 Optionen

const DISCORD_API = "https://discord.com/api/v10";

function authHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Verfuegbarkeit als kompakter Balken - macht auf einen Blick sichtbar, wie
 * viel von einem Item noch da ist, statt nur "3/5" lesen zu muessen.
 * Beispiel: 2 von 5 verliehen -> "▰▰▰▱▱".
 */
function availabilityBar(available: number, total: number): string {
  const width = Math.min(total, 5);
  if (width <= 0) return "";
  const filled = Math.round((Math.max(0, available) / total) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function availabilityIcon(available: number, total: number): string {
  if (available <= 0) return "🔴";
  if (available <= total / 2) return "🟡";
  return "🟢";
}

// Passende Emojis fuer die haeufigsten Kategorienamen - rein kosmetisch,
// damit die Kategorie-Nachrichten auf einen Blick unterscheidbar sind.
const CATEGORY_EMOJI: { match: RegExp; emoji: string }[] = [
  { match: /angel/i, emoji: "🎣" },
  { match: /axt|äxte|axte/i, emoji: "🪓" },
  { match: /bogen/i, emoji: "🏹" },
  { match: /bohrer|multitool/i, emoji: "🛠️" },
  { match: /flieg/i, emoji: "🪽" },
  { match: /mace|streitkolben/i, emoji: "🔨" },
  { match: /rüstungsteil|ruestungsteil/i, emoji: "🥾" },
  { match: /rüstung|ruestung/i, emoji: "🛡️" },
  { match: /schaufel/i, emoji: "🥄" },
  { match: /schwert|klinge/i, emoji: "⚔️" },
  { match: /speed|geschwindigkeit/i, emoji: "⚡" },
  { match: /spitzhacke|picke/i, emoji: "⛏️" },
  { match: /trank|potion/i, emoji: "🧪" },
  { match: /fahrzeug|cart|auto/i, emoji: "🏎️" },
  { match: /talisman|amulett/i, emoji: "🔮" },
];

function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI.find((e) => e.match.test(name))?.emoji ?? "📁";
}

/** Eine geplante Panel-Nachricht: sortKey haelt Reihenfolge und Zuordnung stabil. */
type PlannedMessage = {
  sortKey: string;
  kind: "HEADER" | "CATEGORY" | "STATUS" | "SEARCH";
  payload: Record<string, unknown>;
};

type PanelItem = {
  id: string;
  name: string;
  quantityTotal: number;
  free: number;
};

type PanelCategory = {
  key: string;
  label: string;
  items: PanelItem[];
};

/** Laedt alle Items mit ihrer aktuellen Verfuegbarkeit, gruppiert nach Kategorie. */
async function loadPanelCategories(): Promise<{
  categories: PanelCategory[];
  totalUnits: number;
  freeUnits: number;
  itemCount: number;
}> {
  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
    include: { category: true },
  });
  const activeLoans = await prisma.loan.groupBy({
    by: ["itemId"],
    where: { status: LOAN_STATUS.ACTIVE },
    _count: { itemId: true },
  });
  const activeByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));

  const grouped = new Map<string, PanelCategory>();
  let totalUnits = 0;
  let freeUnits = 0;

  for (const item of items) {
    const free = Math.max(0, item.quantityTotal - (activeByItem.get(item.id) ?? 0));
    totalUnits += item.quantityTotal;
    freeUnits += free;

    const key = item.category?.id ?? NO_CATEGORY_VALUE;
    const label = item.category?.name ?? "Ohne Kategorie";
    if (!grouped.has(key)) grouped.set(key, { key, label, items: [] });
    grouped.get(key)!.items.push({
      id: item.id,
      name: item.name,
      quantityTotal: item.quantityTotal,
      free,
    });
  }

  const categories = [...grouped.values()].sort((a, b) => {
    if (a.label === "Ohne Kategorie") return 1;
    if (b.label === "Ohne Kategorie") return -1;
    return a.label.localeCompare(b.label, "de");
  });

  return { categories, totalUnits, freeUnits, itemCount: items.length };
}

/**
 * Plant den kompletten Aufbau des Ausleih-Kanals als Liste einzelner
 * Nachrichten - in genau der Reihenfolge, in der sie im Kanal stehen sollen:
 * Kopfzeile, je eine Nachricht pro Kategorie (bei mehr als 25 Items
 * seitenweise aufgeteilt, damit wirklich JEDES Item direkt auswaehlbar ist),
 * darunter die aktuellen Ausleihen und ganz unten die Suche.
 */
async function planPanelMessages(): Promise<PlannedMessage[]> {
  const { categories, totalUnits, freeUnits, itemCount } = await loadPanelCategories();
  const planned: PlannedMessage[] = [];

  planned.push({
    sortKey: "0_header",
    kind: "HEADER",
    payload: {
      embeds: [
        {
          title: `📦  ${SITE_NAME}  ·  Ausleihe`,
          description: [
            "Willkommen im Verleih! Unten findest du **den kompletten Bestand**, nach Kategorien sortiert.",
            "",
            "**So funktioniert's**",
            "> **1.** Kategorie unten suchen und im Menü ein Item auswählen",
            "> **2.** Auf **Ausleihen** klicken — fertig",
            "> **3.** Nach **2 Stunden** zurückgeben, sonst gibt es eine Sperre",
            "",
            "🟢 frei · 🟡 fast vergriffen · 🔴 komplett verliehen",
          ].join("\n"),
          color: 0xf2b544,
          fields: [
            { name: "Bestand", value: `\`${itemCount}\` Item-Arten`, inline: true },
            { name: "Verfügbar", value: `\`${freeUnits}/${totalUnits}\` Stück`, inline: true },
            { name: "Kategorien", value: `\`${categories.length}\``, inline: true },
          ],
          footer: { text: "Ganz unten kannst du außerdem gezielt nach einem Item suchen." },
        },
      ],
    },
  });

  categories.forEach((category, categoryIndex) => {
    // Discord-Select: maximal 25 Optionen - groessere Kategorien werden auf
    // mehrere Nachrichten aufgeteilt, damit kein Item unerreichbar bleibt.
    const pages: PanelItem[][] = [];
    for (let i = 0; i < category.items.length; i += MAX_SELECT_OPTIONS) {
      pages.push(category.items.slice(i, i + MAX_SELECT_OPTIONS));
    }

    const categoryFree = category.items.reduce((sum, i) => sum + i.free, 0);
    const categoryTotal = category.items.reduce((sum, i) => sum + i.quantityTotal, 0);
    const emoji = categoryEmoji(category.label);

    pages.forEach((pageItems, pageIndex) => {
      const heading =
        pages.length > 1
          ? `${emoji}  ${category.label}  ·  Teil ${pageIndex + 1}/${pages.length}`
          : `${emoji}  ${category.label}`;

      const lines = pageItems.map(
        (item) =>
          `${availabilityIcon(item.free, item.quantityTotal)} **${item.name}**\n` +
          ` \`${availabilityBar(item.free, item.quantityTotal)}\` ${item.free}/${item.quantityTotal} frei`
      );

      planned.push({
        sortKey: `1_${String(categoryIndex).padStart(3, "0")}_${category.key}_${pageIndex}`,
        kind: "CATEGORY",
        payload: {
          embeds: [
            {
              title: heading,
              description: lines.join("\n"),
              color: categoryFree > 0 ? 0xf2b544 : 0xf2545b,
              footer: {
                text:
                  pages.length > 1
                    ? `${pageItems.length} Items auf dieser Seite · Kategorie gesamt: ${categoryFree}/${categoryTotal} Stück frei`
                    : `${category.items.length} Item-Arten · ${categoryFree}/${categoryTotal} Stück frei`,
              },
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: CATEGORY_ITEM_SELECT_ID,
                  placeholder: `${category.label} — Item auswählen…`.slice(0, 150),
                  options: pageItems.map((item) => ({
                    label: `${availabilityIcon(item.free, item.quantityTotal)} ${item.name}`.slice(0, 100),
                    value: item.id,
                    description: `${item.free} von ${item.quantityTotal} frei`.slice(0, 100),
                  })),
                },
              ],
            },
          ],
        },
      });
    });
  });

  planned.push({
    sortKey: "8_status",
    kind: "STATUS",
    payload: (await buildStatusPanelPayload()) as unknown as Record<string, unknown>,
  });

  planned.push({
    sortKey: "9_search",
    kind: "SEARCH",
    payload: {
      embeds: [
        {
          title: "🔍  Gezielt suchen",
          description:
            "Du weißt schon, was du brauchst? Such direkt nach dem Namen, statt dich durch die Kategorien zu scrollen.",
          color: 0x5b8cff,
          footer: { text: "Die Suche geht über den kompletten Bestand." },
        },
      ],
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 1, label: "🔍 Item suchen", custom_id: PANEL_SEARCH_BUTTON_ID }],
        },
      ],
    },
  });

  return planned;
}

/**
 * Baut die (ephemere, nur fuer den klickenden Nutzer sichtbare) Item-Auswahl
 * fuer eine per Kategorie-Select gewaehlte Kategorie. Wird als eigene
 * Nachricht als Antwort auf die Kategorie-Auswahl gepostet (oder beim
 * Seitenwechsel per UPDATE_MESSAGE ersetzt). `page` ist 0-basiert; bei mehr
 * als MAX_SELECT_OPTIONS Items in der Kategorie kommt eine zweite Zeile mit
 * Zurueck/Weiter-Buttons dazu, damit wirklich alle Items erreichbar sind
 * (ein einzelnes Discord-Select erlaubt maximal 25 Optionen).
 */
export async function buildCategoryItemSelectPayload(categoryValue: string, page = 0) {
  const where = categoryValue === NO_CATEGORY_VALUE ? { categoryId: null } : { categoryId: categoryValue };

  const totalInCategory = await prisma.item.count({ where });
  if (totalInCategory === 0) {
    return { content: "In dieser Kategorie sind aktuell keine Items hinterlegt.", components: [] };
  }

  const pageCount = Math.max(1, Math.ceil(totalInCategory / MAX_SELECT_OPTIONS));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  const items = await prisma.item.findMany({
    where,
    orderBy: { name: "asc" },
    skip: safePage * MAX_SELECT_OPTIONS,
    take: MAX_SELECT_OPTIONS,
  });

  const activeLoans = await prisma.loan.groupBy({
    by: ["itemId"],
    where: { status: LOAN_STATUS.ACTIVE, itemId: { in: items.map((i) => i.id) } },
    _count: { itemId: true },
  });
  const activeByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));

  const components: unknown[] = [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: CATEGORY_ITEM_SELECT_ID,
          placeholder: "Item auswählen...",
          options: items.map((item) => {
            const borrowed = activeByItem.get(item.id) ?? 0;
            const available = Math.max(0, item.quantityTotal - borrowed);
            return {
              label: `${availabilityIcon(available, item.quantityTotal)} ${item.name}`.slice(0, 100),
              value: item.id,
              description: `${availabilityBar(available, item.quantityTotal)}  ${available} von ${item.quantityTotal} frei`.slice(0, 100),
            };
          }),
        },
      ],
    },
  ];

  if (pageCount > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: "◀ Zurück",
          custom_id: `${CATEGORY_PAGE_PREFIX}${categoryValue}:${safePage - 1}`,
          disabled: safePage === 0,
        },
        {
          type: 2,
          style: 2,
          label: `Seite ${safePage + 1}/${pageCount}`,
          custom_id: `${CATEGORY_PAGE_PREFIX}${categoryValue}:${safePage}`,
          disabled: true,
        },
        {
          type: 2,
          style: 2,
          label: "Weiter ▶",
          custom_id: `${CATEGORY_PAGE_PREFIX}${categoryValue}:${safePage + 1}`,
          disabled: safePage >= pageCount - 1,
        },
      ],
    });
  }

  return {
    content: `Item auswählen (${totalInCategory} insgesamt${pageCount > 1 ? `, Seite ${safePage + 1}/${pageCount}` : ""}):`,
    components,
  };
}

/**
 * Wie buildCategoryItemSelectPayload, aber gefiltert per Freitext-Suche
 * (Name enthaelt Suchbegriff, ohne Gross-/Kleinschreibung) statt per
 * Kategorie - sucht immer ueber ALLE Items. `query` wird 1:1 in den
 * Paging-Button-custom_id eingebettet, deshalb auf eine sichere Laenge
 * begrenzt (Discord erlaubt max. 100 Zeichen pro custom_id).
 */
export async function buildItemSearchResultPayload(query: string, page = 0) {
  const safeQuery = query.trim().slice(0, 60);
  if (!safeQuery) {
    return { content: "Bitte einen Suchbegriff eingeben.", components: [] };
  }

  const where = { name: { contains: safeQuery, mode: "insensitive" as const } };
  const totalMatches = await prisma.item.count({ where });
  if (totalMatches === 0) {
    return { content: `Kein Item gefunden für „${safeQuery}“.`, components: [] };
  }

  const pageCount = Math.max(1, Math.ceil(totalMatches / MAX_SELECT_OPTIONS));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  const items = await prisma.item.findMany({
    where,
    orderBy: { name: "asc" },
    skip: safePage * MAX_SELECT_OPTIONS,
    take: MAX_SELECT_OPTIONS,
    include: { category: true },
  });

  const activeLoans = await prisma.loan.groupBy({
    by: ["itemId"],
    where: { status: LOAN_STATUS.ACTIVE, itemId: { in: items.map((i) => i.id) } },
    _count: { itemId: true },
  });
  const activeByItem = new Map(activeLoans.map((l) => [l.itemId, l._count.itemId]));

  const components: unknown[] = [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: ITEM_SEARCH_SELECT_ID,
          placeholder: "Item auswählen...",
          options: items.map((item) => {
            const borrowed = activeByItem.get(item.id) ?? 0;
            const available = Math.max(0, item.quantityTotal - borrowed);
            return {
              label: `${availabilityIcon(available, item.quantityTotal)} ${item.name}`.slice(0, 100),
              value: item.id,
              description: `${item.category?.name ?? "Ohne Kategorie"} · ${available}/${item.quantityTotal} frei`.slice(0, 100),
            };
          }),
        },
      ],
    },
  ];

  if (pageCount > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: "◀ Zurück",
          custom_id: `${ITEM_SEARCH_PAGE_PREFIX}${safePage - 1}:${safeQuery}`,
          disabled: safePage === 0,
        },
        {
          type: 2,
          style: 2,
          label: `Seite ${safePage + 1}/${pageCount}`,
          custom_id: `${ITEM_SEARCH_PAGE_PREFIX}${safePage}:${safeQuery}`,
          disabled: true,
        },
        {
          type: 2,
          style: 2,
          label: "Weiter ▶",
          custom_id: `${ITEM_SEARCH_PAGE_PREFIX}${safePage + 1}:${safeQuery}`,
          disabled: safePage >= pageCount - 1,
        },
      ],
    });
  }

  return {
    content: `🔍 „${safeQuery}“ — ${totalMatches} Treffer${pageCount > 1 ? `, Seite ${safePage + 1}/${pageCount}` : ""}:`,
    components,
  };
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

  const now = Date.now();
  const lines = activeLoans.map((loan) => {
    const borrowedUnix = Math.floor(loan.borrowedAt.getTime() / 1000);
    // Discord rendert <t:unix:R> live mit ("in 20 Minuten" / "vor 5 Minuten") -
    // dadurch bleibt die Frist aktuell, ohne die Nachricht dauernd zu editieren.
    if (!loan.dueAt) {
      return `📦 **${loan.item.name}**\n└ ${loan.member.displayName} · seit <t:${borrowedUnix}:R>`;
    }
    const dueUnix = Math.floor(loan.dueAt.getTime() / 1000);
    const overdue = loan.dueAt.getTime() < now;
    const marker = overdue ? "🔴 **überfällig**" : "🟢 zurück";
    return `📦 **${loan.item.name}**\n└ ${loan.member.displayName} · seit <t:${borrowedUnix}:R> · ${marker} <t:${dueUnix}:R>`;
  });

  const overdueCount = activeLoans.filter((l) => l.dueAt && l.dueAt.getTime() < now).length;

  // Bei sehr vielen gleichzeitigen Ausleihen nicht ins Zeichenlimit laufen
  // (Embed-Beschreibung: 4096 Zeichen).
  const shown: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > 3800) break;
    shown.push(line);
    length += line.length + 1;
  }
  const hidden = lines.length - shown.length;
  if (hidden > 0) shown.push(`\n… und ${hidden} weitere.`);

  const embed = {
    title: `📋 ${SITE_NAME} — Aktuell ausgeliehen`,
    description: shown.length > 0 ? shown.join("\n") : "Aktuell ist nichts ausgeliehen. Alles zurück im Regal. ✨",
    color: overdueCount > 0 ? 0xf2545b : 0x3ddc97,
    footer: {
      text:
        overdueCount > 0
          ? `${activeLoans.length} aktive Ausleihe(n) · ${overdueCount} überfällig`
          : `${activeLoans.length} aktive Ausleihe(n)`,
    },
    // Bewusst KEIN timestamp: der wuerde sich bei jedem Durchlauf aendern und
    // die Nachricht immer als "geaendert" gelten lassen (siehe contentHash).
    // Die Zeitangaben stehen ohnehin live in den Zeilen selbst.
  };

  return { embeds: [embed] };
}

/**
 * Baut das Ticket-Panel (zwei Buttons: Support / Bewerbung). Wird nur in
 * dem Kanal gepostet, den der Owner dafuer eingerichtet hat - Sichtbarkeit
 * fuer die Kunde-Rolle wird separat per Discord-Berechtigung gesteuert
 * (BotDeployment.ticketsVisibleToCustomers), nicht ueber den Panel-Inhalt.
 */
export function buildTicketPanelPayload() {
  const embed = {
    title: `🎫 ${SITE_NAME} — Tickets`,
    description:
      "**🎧 Support** — allgemeine Fragen/Probleme, z.B. Abo pausieren.\n" +
      "**📝 Bewerbung** — Kunde beim LeihCenter werden.",
    color: 0x3ddc97,
  };

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "🎧 Support", custom_id: TICKET_OPEN_SUPPORT_ID },
          { type: 2, style: 1, label: "📝 Bewerbung", custom_id: TICKET_OPEN_BEWERBUNG_ID },
        ],
      },
    ],
  };
}

type PostResult = { ok: true } | { ok: false; error: string };

/** Postet eine Nachricht neu oder editiert eine vorhandene (per Message-ID) in einem Kanal. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pruefsumme eines Nachrichten-Inhalts, um unveraenderte Nachrichten zu erkennen. */
function hashPayload(payload: unknown): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Fuehrt eine Discord-Anfrage aus und beachtet dabei das Rate-Limit: bei 429
 * wartet sie die von Discord genannte Zeit ab und versucht es erneut. Ohne
 * das scheitert der Neuaufbau des Panels, sobald mehr als eine Handvoll
 * Nachrichten kurz hintereinander gepostet werden.
 */
async function discordFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429 || attempt >= 5) return res;

  const body = (await res.json().catch(() => null)) as { retry_after?: number } | null;
  const waitMs = Math.ceil((body?.retry_after ?? 1) * 1000) + 250;
  await sleep(waitMs);
  return discordFetch(url, init, attempt + 1);
}

async function postOrUpdateMessage(
  channelId: string,
  existingMessageId: string | null,
  payload: unknown
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (existingMessageId) {
    const res = await discordFetch(`${DISCORD_API}/channels/${channelId}/messages/${existingMessageId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, messageId: existingMessageId };
    // Nachricht existiert nicht mehr (z.B. geloescht) -> neu posten.
  }

  const res = await discordFetch(`${DISCORD_API}/channels/${channelId}/messages`, {
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

/** Loescht eine Nachricht - ein 404 ist kein Fehler (schon weg = Ziel erreicht). */
async function deleteMessage(channelId: string, messageId: string): Promise<void> {
  await discordFetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).catch(() => {});
}

/**
 * Loescht mehrere Nachrichten moeglichst in einem Rutsch. Einzeln geloescht
 * frisst das bei ~20 Nachrichten das komplette Rate-Limit auf, sodass
 * anschliessend nichts mehr gepostet werden kann. Discords Bulk-Delete
 * schafft bis zu 100 Nachrichten pro Aufruf, gilt aber nur fuer Nachrichten,
 * die juenger als 14 Tage sind - deshalb der Einzel-Fallback.
 */
async function deleteMessages(channelId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  if (messageIds.length === 1) {
    await deleteMessage(channelId, messageIds[0]);
    return;
  }

  for (let i = 0; i < messageIds.length; i += 100) {
    const chunk = messageIds.slice(i, i + 100);
    const res = await discordFetch(`${DISCORD_API}/channels/${channelId}/messages/bulk-delete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ messages: chunk }),
    }).catch(() => null);

    if (!res || !res.ok) {
      // Aelter als 14 Tage oder Bulk-Delete nicht erlaubt -> einzeln, mit
      // etwas Abstand, damit wir das Limit nicht komplett aufbrauchen.
      for (const id of chunk) {
        await deleteMessage(channelId, id);
        await sleep(350);
      }
    }
  }
}

/**
 * Postet bzw. aktualisiert das komplette Ausleih-Panel. Es besteht aus
 * mehreren Nachrichten (Kopfzeile, je eine pro Kategorie, aktuelle Ausleihen,
 * Suche) - siehe planPanelMessages.
 *
 * Aendert sich nur der Inhalt (Verfuegbarkeiten), werden die vorhandenen
 * Nachrichten editiert - das ist der Normalfall und erzeugt keinerlei
 * Kanal-Spam. Aendert sich die STRUKTUR (Kategorie kommt dazu oder faellt
 * weg), wird das Panel einmal komplett neu aufgebaut, weil neu gepostete
 * Nachrichten in Discord sonst unten statt an der richtigen Stelle landen
 * wuerden.
 */
export async function postOrUpdatePanel(deploymentId: string): Promise<PostResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || !deployment.active) return { ok: false, error: "Deployment nicht gefunden." };

  const planned = await planPanelMessages();
  const existing = await prisma.panelMessage.findMany({
    where: { deploymentId },
    orderBy: { sortKey: "asc" },
  });
  const existingByKey = new Map(existing.map((m) => [m.sortKey, m]));

  const plannedKeys = planned.map((p) => p.sortKey).sort().join("|");
  const existingKeys = existing.map((m) => m.sortKey).sort().join("|");
  const structureChanged = plannedKeys !== existingKeys;

  // Erststart oder Strukturaenderung: alles alte weg, danach der Reihe nach
  // sauber neu posten. Die alte Einzel-Panel-Nachricht (panelMessageId aus der
  // Zeit vor dem Umbau) wird dabei ebenfalls entfernt.
  if (structureChanged) {
    const toDelete = existing.map((m) => m.messageId);
    if (deployment.panelMessageId) toDelete.push(deployment.panelMessageId);
    await deleteMessages(deployment.channelId, toDelete);

    await prisma.panelMessage.deleteMany({ where: { deploymentId } });
    if (deployment.panelMessageId) {
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: { panelMessageId: null },
      });
    }

    for (const [index, item] of planned.entries()) {
      // Discord erlaubt nur wenige Nachrichten pro Sekunde und Kanal. Der
      // Abstand haelt uns unter dem Limit; discordFetch faengt einen trotzdem
      // auftretenden 429 zusaetzlich ab.
      if (index > 0) await sleep(1100);

      const result = await postOrUpdateMessage(deployment.channelId, null, item.payload);
      if (!result.ok) return result;
      await prisma.panelMessage.create({
        data: {
          deploymentId,
          kind: item.kind,
          sortKey: item.sortKey,
          messageId: result.messageId,
          contentHash: hashPayload(item.payload),
        },
      });
    }
    return { ok: true };
  }

  // Normalfall: nur die Nachrichten anfassen, deren Inhalt sich tatsaechlich
  // geaendert hat. Eine einzelne Ausleihe betrifft in der Regel genau zwei
  // (die Kategorie des Items und die Liste der aktuellen Ausleihen) - alles
  // andere unveraendert zu lassen haelt uns weit weg vom Rate-Limit.
  let edited = 0;
  for (const item of planned) {
    const stored = existingByKey.get(item.sortKey);
    const hash = hashPayload(item.payload);
    if (stored && stored.contentHash === hash) continue;

    if (edited > 0) await sleep(400);
    const result = await postOrUpdateMessage(deployment.channelId, stored?.messageId ?? null, item.payload);
    if (!result.ok) return result;
    edited += 1;

    if (stored) {
      await prisma.panelMessage.update({
        where: { id: stored.id },
        data: { messageId: result.messageId, contentHash: hash },
      });
    }
  }

  // Optionaler separater Status-Kanal bleibt zusaetzlich bestehen, falls
  // eingerichtet - die Ausleihen stehen jetzt aber ohnehin im Ausleih-Kanal.
  if (deployment.statusChannelId && deployment.statusChannelId !== deployment.channelId) {
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

/**
 * Postet/aktualisiert das Ticket-Panel im vom Owner konfigurierten Kanal
 * (BotDeployment.ticketPanelChannelId). Getrennt vom Item-Panel, da beide
 * unabhaengig voneinander eingerichtet werden.
 */
export async function postOrUpdateTicketPanel(deploymentId: string): Promise<PostResult> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || !deployment.ticketPanelChannelId) {
    return { ok: false, error: "Kein Ticket-Panel-Kanal konfiguriert." };
  }

  const payload = buildTicketPanelPayload();
  const result = await postOrUpdateMessage(deployment.ticketPanelChannelId, deployment.ticketPanelMessageId, payload);

  if (result.ok && result.messageId !== deployment.ticketPanelMessageId) {
    await prisma.botDeployment.update({
      where: { id: deploymentId },
      data: { ticketPanelMessageId: result.messageId },
    });
  }
  return result;
}

/** Aktualisiert alle aktiven Panels - nach jeder Aenderung an Items/Ausleihen aufrufen. */
export async function refreshAllPanels(): Promise<void> {
  if (!DISCORD_BOT_TOKEN) return;
  const deployments = await prisma.botDeployment.findMany({ where: { active: true } });
  const results = await Promise.all(deployments.map((d) => postOrUpdatePanel(d.id)));
  results.forEach((result, i) => {
    if (!result.ok) {
      console.error(`[discordPanel] Panel fuer Server ${deployments[i].guildId} fehlgeschlagen:`, result.error);
    }
  });
}

/** Wie refreshAllPanels(), schluckt aber Fehler - Panels sind ein Zusatz und
 * duerfen die eigentliche Web-Aktion nie scheitern lassen. Der Fehler wird
 * trotzdem geloggt, damit ein dauerhaft veraltetes Discord-Panel (z.B. Kanal
 * geloescht, Token abgelaufen) nicht komplett unbemerkt bleibt. */
export async function refreshPanelsQuietly(): Promise<void> {
  try {
    await refreshAllPanels();
  } catch (err) {
    console.error("[discordPanel] Panel-Aktualisierung fehlgeschlagen:", err);
  }
}
