import { prisma } from "@/lib/prisma";
import { DISCORD_BOT_TOKEN } from "@/lib/discord";
import { LOAN_STATUS, SITE_NAME } from "@/lib/constants";
import {
  CATEGORY_ITEM_SELECT_ID,
  CATEGORY_PAGE_PREFIX,
  ITEM_SEARCH_PAGE_PREFIX,
  ITEM_SEARCH_SELECT_ID,
  NO_CATEGORY_VALUE,
  PANEL_CATEGORY_SELECT_ID,
  PANEL_SEARCH_BUTTON_ID,
  PANEL_SELECT_ID,
  TICKET_OPEN_BEWERBUNG_ID,
  TICKET_OPEN_SUPPORT_ID,
} from "@/lib/discordInteractions";

const MAX_SELECT_OPTIONS = 25; // Discord-Select-Menues erlauben maximal 25 Optionen
const MAX_EMBED_FIELDS = 25; // Discord-Limit: maximal 25 Felder pro Embed
const MAX_FIELD_CHARS = 1000; // Discord-Limit pro Feldwert ist 1024 - etwas Puffer lassen
const MAX_EMBED_CHARS = 5600; // Discord-Gesamtlimit pro Embed ist 6000 - Puffer fuer Titel/Footer

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

async function buildPanelPayload() {
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

  // Nach Kategorie gruppiert darstellen (wie auf der Website), damit der
  // Bestand auch bei vielen Items lesbar bleibt. "Ohne Kategorie" zuletzt.
  const grouped = new Map<string, { label: string; lines: string[] }>();
  let totalUnits = 0;
  let availableUnits = 0;

  for (const item of items) {
    const borrowed = activeByItem.get(item.id) ?? 0;
    const available = Math.max(0, item.quantityTotal - borrowed);
    totalUnits += item.quantityTotal;
    availableUnits += available;

    const key = item.category?.id ?? "__none";
    const label = item.category?.name ?? "Ohne Kategorie";
    if (!grouped.has(key)) grouped.set(key, { label, lines: [] });
    grouped.get(key)!.lines.push(
      `${availabilityIcon(available, item.quantityTotal)} **${item.name}** \`${availabilityBar(available, item.quantityTotal)}\` ${available}/${item.quantityTotal}`
    );
  }

  const sortedGroups = [...grouped.values()].sort((a, b) => {
    if (a.label === "Ohne Kategorie") return 1;
    if (b.label === "Ohne Kategorie") return -1;
    return a.label.localeCompare(b.label, "de");
  });

  const description =
    items.length === 0
      ? "Aktuell sind keine Items hinterlegt."
      : [
          `**${availableUnits}** von **${totalUnits}** Stück sofort verfügbar` +
            `  \`${availabilityBar(availableUnits, Math.max(totalUnits, 1))}\``,
          `${items.length} Item-Art(en) in ${sortedGroups.length} Kategorie(n)`,
          "",
          "🟢 frei · 🟡 fast vergriffen · 🔴 komplett verliehen",
        ].join("\n");

  // Discord begrenzt ein Embed auf 25 Felder, 1024 Zeichen pro Feld UND
  // 6000 Zeichen insgesamt (Titel + Beschreibung + alle Felder + Footer).
  // Nur das Gesamtlimit zu ignorieren hat das Panel bei grossem Bestand
  // komplett scheitern lassen (MAX_EMBED_SIZE_EXCEEDED), deshalb wird hier
  // ein laufendes Budget mitgefuehrt und sauber abgeschnitten.
  const fields: { name: string; value: string; inline: boolean }[] = [];
  let hiddenItems = 0;
  let budget = MAX_EMBED_CHARS - description.length - 120; // Titel + Footer grosszuegig einkalkuliert

  for (const group of sortedGroups) {
    const name = `${group.label} · ${group.lines.length}`;
    if (fields.length >= MAX_EMBED_FIELDS || budget - name.length < 40) {
      hiddenItems += group.lines.length;
      continue;
    }
    budget -= name.length;

    let value = "";
    let shown = 0;
    for (const line of group.lines) {
      const cost = line.length + 1;
      if (value.length + cost > MAX_FIELD_CHARS || cost > budget) break;
      value += (value ? "\n" : "") + line;
      budget -= cost;
      shown += 1;
    }
    hiddenItems += group.lines.length - shown;
    if (shown === 0) {
      // Kategorie passt nicht mehr rein - Feldnamen-Budget zurueckgeben.
      budget += name.length;
      continue;
    }
    fields.push({ name, value, inline: false });
  }

  const embed = {
    title: `📦 ${SITE_NAME} — Ausleihe`,
    description,
    color: 0xf2b544,
    fields: items.length > 0 ? fields : undefined,
    footer: {
      text:
        hiddenItems > 0
          ? `… und ${hiddenItems} weitere — über „Item suchen“ oder die Kategorie-Auswahl erreichbar.`
          : "Kategorie wählen oder suchen, um auszuleihen bzw. zurückzugeben.",
    },
    timestamp: new Date().toISOString(),
  };

  // Kategorien mit mindestens einem Item ermitteln, plus Anzahl unkategorisierter
  // Items - jeweils inklusive der aktuell freien Stueckzahl fuer die Auswahl.
  const categoryCounts = new Map<string, { name: string; count: number; free: number }>();
  let uncategorizedCount = 0;
  let uncategorizedFree = 0;
  for (const item of items) {
    const free = Math.max(0, item.quantityTotal - (activeByItem.get(item.id) ?? 0));
    if (item.category) {
      const existing = categoryCounts.get(item.category.id);
      categoryCounts.set(item.category.id, {
        name: item.category.name,
        count: (existing?.count ?? 0) + 1,
        free: (existing?.free ?? 0) + free,
      });
    } else {
      uncategorizedCount++;
      uncategorizedFree += free;
    }
  }
  const categoryBuckets = categoryCounts.size + (uncategorizedCount > 0 ? 1 : 0);

  // Bei mehr als einem "Eimer" (Kategorie oder "ohne Kategorie") ODER mehr
  // Items als in ein einzelnes Select passen, erst eine Kategorie waehlen
  // lassen - sonst reicht die direkte flache Item-Auswahl wie bisher, ohne
  // unnoetigen Extra-Klick.
  const needsCategoryStep = categoryBuckets > 1 || items.length > MAX_SELECT_OPTIONS;

  let components: unknown[] = [];
  if (items.length === 0) {
    components = [];
  } else if (!needsCategoryStep) {
    components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: PANEL_SELECT_ID,
            placeholder: "Item auswählen...",
            options: items.slice(0, MAX_SELECT_OPTIONS).map((item) => {
              const free = Math.max(0, item.quantityTotal - (activeByItem.get(item.id) ?? 0));
              return {
                label: `${availabilityIcon(free, item.quantityTotal)} ${item.name}`.slice(0, 100),
                value: item.id,
                description: `${item.category?.name ?? "Ohne Kategorie"} · ${free}/${item.quantityTotal} frei`.slice(0, 100),
              };
            }),
          },
        ],
      },
    ];
  } else {
    const categoryOptions = [...categoryCounts.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, "de"))
      .map(([id, { name, count, free }]) => ({
        label: name.slice(0, 100),
        value: id,
        description: `${count} Item-Art(en) · ${free} Stück frei`.slice(0, 100),
      }));
    if (uncategorizedCount > 0) {
      categoryOptions.push({
        label: "Ohne Kategorie",
        value: NO_CATEGORY_VALUE,
        description: `${uncategorizedCount} Item-Art(en) · ${uncategorizedFree} Stück frei`.slice(0, 100),
      });
    }

    components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: PANEL_CATEGORY_SELECT_ID,
            placeholder: "Kategorie auswählen...",
            options: categoryOptions.slice(0, MAX_SELECT_OPTIONS),
          },
        ],
      },
    ];
  }

  // Suchen-Button immer zusaetzlich anzeigen, solange es ueberhaupt Items
  // gibt - unabhaengig davon, ob gerade die flache oder die Kategorie-
  // Auswahl aktiv ist, damit man nicht erst durch Kategorien klicken muss.
  if (items.length > 0) {
    components.push({
      type: 1,
      components: [
        { type: 2, style: 2, label: "🔍 Item suchen", custom_id: PANEL_SEARCH_BUTTON_ID },
      ],
    });
  }

  return { embeds: [embed], components };
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
    timestamp: new Date().toISOString(),
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
