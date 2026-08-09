import { PRICE_SOURCE_URL } from "@/lib/constants";

export type PriceSourceItem = {
  key: string;
  name: string;
  material: string | null;
  icon: string | null;
  category: string | null;
  averagePrice: number;
  saleCount: number;
};

type RawPriceSourceObject = {
  key?: string;
  item_display?: string;
  variant_suffix?: string;
  item_material?: string;
  icon?: string;
  category?: string;
  market_value?: number;
  avg_price?: number;
  latest_price?: number;
  sale_count?: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minuten
let cache: { items: PriceSourceItem[]; fetchedAt: number } | null = null;

/**
 * Die Item-Datenbank auf btc-clan.xyz ist eine per Next.js server-gerenderte
 * Seite. Die vollständigen Item-Daten stecken bereits im initialen HTML als
 * eingebettetes React-Flight-Payload (`self.__next_f.push([...])`), es gibt
 * keine separate JSON-API. Wir lesen die Rohdaten deshalb direkt aus dem
 * HTML-Text: zuerst die JS-String-Literale der push()-Aufrufe sauber
 * entschlüsseln, danach darin einzelne Item-Objekte anhand des Feldes
 * "item_display" balanciert herausschneiden und per JSON.parse einlesen.
 *
 * Das ist bewusst defensiv geschrieben (kein Crash bei Formatänderungen),
 * weil es sich um kein offizielles/dokumentiertes API handelt: ändert sich
 * das Seitenformat, liefert fetchPriceSourceItems() einfach 0 Treffer bzw.
 * wirft einen Fehler, und der Aufrufer markiert betroffene Items als
 * "Preis nicht verfügbar" statt falsche Daten zu übernehmen.
 */
function unescapeJsStringLiteral(html: string, quoteStart: number): { value: string; end: number } {
  let i = quoteStart;
  let out = "";
  while (i < html.length) {
    const ch = html[i];
    if (ch === "\\") {
      const next = html[i + 1];
      switch (next) {
        case "n":
          out += "\n";
          i += 2;
          break;
        case "t":
          out += "\t";
          i += 2;
          break;
        case "r":
          i += 2;
          break;
        case '"':
          out += '"';
          i += 2;
          break;
        case "'":
          out += "'";
          i += 2;
          break;
        case "\\":
          out += "\\";
          i += 2;
          break;
        case "/":
          out += "/";
          i += 2;
          break;
        case "u": {
          const hex = html.slice(i + 2, i + 6);
          out += String.fromCharCode(parseInt(hex, 16) || 0);
          i += 6;
          break;
        }
        default:
          out += next ?? "";
          i += 2;
      }
    } else if (ch === '"') {
      return { value: out, end: i + 1 };
    } else {
      out += ch;
      i += 1;
    }
  }
  return { value: out, end: i };
}

function extractFlightPayloadText(html: string): string {
  const marker = "self.__next_f.push(";
  let combined = "";
  let searchFrom = 0;

  while (true) {
    const callStart = html.indexOf(marker, searchFrom);
    if (callStart === -1) break;

    let i = callStart + marker.length;
    if (html[i] !== "[") {
      searchFrom = callStart + marker.length;
      continue;
    }
    i++;
    while (i < html.length && html[i] !== ",") i++;
    i++;
    while (html[i] === " ") i++;

    if (html[i] !== '"') {
      searchFrom = callStart + marker.length;
      continue;
    }

    const { value, end } = unescapeJsStringLiteral(html, i + 1);
    combined += value + "\n";
    searchFrom = end;
  }

  return combined;
}

function findEnclosingObject(text: string, anchorIndex: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = anchorIndex; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return null;

  let d = 0;
  let inStr = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (ch === "\\") {
        j++;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") d++;
    else if (ch === "}") {
      d--;
      if (d === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}

function prettifyCategory(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^sub_/, "").replace(/_/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseItemsFromFlightText(text: string): PriceSourceItem[] {
  const anchor = '"item_display":"';
  const byKey = new Map<string, PriceSourceItem>();
  let searchFrom = 0;

  while (true) {
    const pos = text.indexOf(anchor, searchFrom);
    if (pos === -1) break;
    searchFrom = pos + anchor.length;

    const objStr = findEnclosingObject(text, pos);
    if (!objStr) continue;

    let raw: RawPriceSourceObject;
    try {
      raw = JSON.parse(objStr);
    } catch {
      continue;
    }

    if (!raw.item_display || !raw.key) continue;

    const averagePrice = Math.round(raw.market_value ?? raw.avg_price ?? raw.latest_price ?? 0);
    if (!Number.isFinite(averagePrice) || averagePrice < 0) continue;

    byKey.set(raw.key, {
      key: raw.key,
      name: `${raw.item_display}${raw.variant_suffix ?? ""}`,
      material: raw.item_material ?? null,
      icon: raw.icon ?? null,
      category: prettifyCategory(raw.category),
      averagePrice,
      saleCount: raw.sale_count ?? 0,
    });
  }

  return Array.from(byKey.values());
}

export async function fetchPriceSourceItems(options?: { forceRefresh?: boolean }): Promise<PriceSourceItem[]> {
  if (!options?.forceRefresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  const res = await fetch(PRICE_SOURCE_URL, {
    cache: "no-store",
    headers: { "User-Agent": "OP-LeihCenter/1.0 (+internal price sync)" },
  });
  if (!res.ok) {
    throw new Error(`Preisquelle antwortete mit Status ${res.status}`);
  }

  const html = await res.text();
  const flightText = extractFlightPayloadText(html);
  const items = parseItemsFromFlightText(flightText);

  if (items.length === 0) {
    throw new Error("Keine Items in der Preisquelle gefunden – Seitenformat hat sich möglicherweise geändert.");
  }

  cache = { items, fetchedAt: Date.now() };
  return items;
}

export async function searchPriceSourceItems(query: string, limit = 20): Promise<PriceSourceItem[]> {
  const items = await fetchPriceSourceItems();
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  return items.filter((item) => item.name.toLowerCase().includes(q)).slice(0, limit);
}

export async function findPriceSourceItemByKey(key: string): Promise<PriceSourceItem | null> {
  const items = await fetchPriceSourceItems();
  return items.find((item) => item.key === key) ?? null;
}
