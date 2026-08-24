import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { roleIdsFromEnv } from "@/lib/discord";
import { generateCustomerNumber } from "@/lib/customerNumber";
import {
  LOAN_CHANNEL,
  LOAN_STATUS,
  MEMBER_STATUS,
  ROLES,
  formatCoins,
} from "@/lib/constants";

export const PANEL_SELECT_ID = "leihcenter_select_item";
export const PANEL_CATEGORY_SELECT_ID = "leihcenter_select_category";
export const CATEGORY_ITEM_SELECT_ID = "leihcenter_select_item_in_category";
/**
 * Auswahlmenue in den OEFFENTLICHEN Kategorie-Kanaelen. Bewusst eine eigene
 * ID: die Antwort darauf muss eine NEUE (nur fuer den Klickenden sichtbare)
 * Nachricht sein. Wuerde hier CATEGORY_ITEM_SELECT_ID stehen, wuerde die
 * Antwort die Panel-Nachricht selbst ueberschreiben - das Panel waere weg.
 */
export const CHANNEL_ITEM_SELECT_ID = "leihcenter_select_item_in_channel";
export const BORROW_PREFIX = "leihcenter_borrow:";
export const RETURN_PREFIX = "leihcenter_return:";
/** Ausbuchen einer FREMDEN Ausleihe durch Aufsicht/Owner ("/ausleihen"). */
export const FORCE_RETURN_PREFIX = "leihcenter_force_return:";
/** custom_id-Format: `${CATEGORY_PAGE_PREFIX}${categoryValue}:${page}` - Seitenwechsel innerhalb einer Kategorie. */
export const CATEGORY_PAGE_PREFIX = "leihcenter_category_page:";
/** Wert im Kategorie-Select fuer Items ohne zugeordnete Kategorie. */
export const NO_CATEGORY_VALUE = "__none";

// Freitext-Suche im Panel: Button oeffnet ein Modal mit einem Textfeld,
// Ergebnis kommt als eigenes (ggf. seitenweises) Select - unabhaengig von
// der Kategorie-Auswahl, sucht immer ueber alle Items.
export const PANEL_SEARCH_BUTTON_ID = "leihcenter_search_open";
/** Zeigt dem Klickenden seine eigenen Ausleihen mit Rueckgabe-Buttons. */
export const MY_LOANS_BUTTON_ID = "leihcenter_my_loans";
export const ITEM_SEARCH_MODAL_ID = "leihcenter_search_modal";
export const ITEM_SEARCH_SELECT_ID = "leihcenter_search_select";
/** custom_id-Format: `${ITEM_SEARCH_PAGE_PREFIX}${page}:${query}` - Seitenwechsel innerhalb der Suchergebnisse. */
export const ITEM_SEARCH_PAGE_PREFIX = "leihcenter_search_page:";

// Ticket-System: Panel-Buttons oeffnen ein Discord-Modal (Text-Eingaben,
// keine Selects moeglich - deshalb Bewerbung zweistufig: erst Paket per
// Select waehlen, dann Modal). custom_id-Format bei Claim/Close:
// `${PREFIX}${ticketId}`.
export const TICKET_OPEN_SUPPORT_ID = "leihcenter_ticket_open_support";
export const TICKET_OPEN_BEWERBUNG_ID = "leihcenter_ticket_open_bewerbung";
export const TICKET_PLAN_SELECT_ID = "leihcenter_ticket_plan_select";

/** Paketauswahl beim Verlaengern per /verlaengern ohne Argument. */
export const RENEW_SELECT_ID = "leihcenter_renew_select";
export const TICKET_CLAIM_PREFIX = "leihcenter_ticket_claim:";
export const TICKET_CLOSE_PREFIX = "leihcenter_ticket_close:";
export const SUPPORT_MODAL_ID = "leihcenter_support_modal";

// Verleih-Service-Ticket: eigener Button im Panel, eigenes Modal mit den fuenf
// Aufnahmefragen (Discord erlaubt genau 5 Felder pro Modal).
export const TICKET_OPEN_VERLEIH_ID = "leihcenter_ticket_open_verleih";
export const VERLEIH_MODAL_ID = "leihcenter_verleih_modal";

// Schliessen in zwei Schritten: der Bearbeiter stellt die Anfrage, der
// Ersteller bestaetigt oder lehnt ab. custom_id-Format: `${PREFIX}${ticketId}`.
export const TICKET_CLOSE_REQUEST_PREFIX = "leihcenter_ticket_close_req:";
export const TICKET_CLOSE_CONFIRM_PREFIX = "leihcenter_ticket_close_yes:";
export const TICKET_CLOSE_DECLINE_PREFIX = "leihcenter_ticket_close_no:";
/** custom_id-Format: `${BEWERBUNG_MODAL_PREFIX}${planId}` - das Paket wurde im vorherigen Schritt per Select gewaehlt. */
export const BEWERBUNG_MODAL_PREFIX = "leihcenter_bewerbung_modal:";

export type DiscordInteractionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

/** Ein Slash-Befehl-Option - bei Subcommands (type 1) steckt der eigentliche Inhalt in "options". */
export type DiscordInteractionOption = {
  name: string;
  type?: number;
  value?: string;
  options?: DiscordInteractionOption[];
};

/** Locker typisiertes Discord-Interaction-Payload - nur die Felder, die wir tatsaechlich nutzen. */
export type DiscordInteractionPayload = {
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: { user: DiscordInteractionUser; roles?: string[] };
  user?: DiscordInteractionUser;
  message?: { id: string; embeds?: unknown[] };
  data?: {
    name?: string;
    custom_id?: string;
    values?: string[];
    options?: DiscordInteractionOption[];
    // Nur bei MODAL_SUBMIT gesetzt: eine Action-Row je Textfeld.
    components?: Array<{ components: Array<{ custom_id: string; value: string }> }>;
  };
  /** Interaktions-Token: noetig, um eine aufgeschobene Antwort nachzutragen. */
  token?: string;
};

/** Liest ein Textfeld aus einem MODAL_SUBMIT-Payload anhand seiner custom_id aus. */
export function getModalValue(interaction: DiscordInteractionPayload, customId: string): string {
  const rows = interaction.data?.components ?? [];
  for (const row of rows) {
    const field = row.components.find((c) => c.custom_id === customId);
    if (field) return field.value;
  }
  return "";
}

function avatarUrlFor(user: DiscordInteractionUser): string | null {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;
}

/**
 * Holt den Member-Datensatz zu einem Discord-User, legt ihn bei Bedarf neu
 * an (z.B. wenn jemand nur ueber das Panel interagiert und sich nie ueber
 * die Website eingeloggt hat). Neu angelegte Mitglieder starten als Kunde,
 * aktiv, ohne Minecraft-Namen - der muss dann auf der Website nachgetragen
 * werden.
 */
export async function ensureMemberFromDiscordUser(user: DiscordInteractionUser) {
  const existing = await prisma.member.findUnique({ where: { discordId: user.id } });
  if (existing) return existing;

  const displayName = user.global_name ?? user.username;
  const created = await prisma.member.create({
    data: {
      discordId: user.id,
      username: user.username,
      displayName,
      avatarUrl: avatarUrlFor(user),
      minecraftName: "",
      role: ROLES.KUNDE,
      status: MEMBER_STATUS.ACTIVE,
      customerNumber: await generateCustomerNumber(),
    },
  });
  await logAction({
    actorId: created.id,
    targetId: created.id,
    action: "MEMBER_CREATED",
    details: "Automatisch angelegt über eine Discord-Panel-Interaktion (Rolle Kunde).",
  });
  return created;
}

/** Prueft, ob eine Discord-Guild-Mitgliederrolle-Liste eine der konfigurierten Aufsicht/Owner-Rollen enthaelt. */
export function hasStaffRole(memberRoles: string[]): boolean {
  const staffIds = [
    ...roleIdsFromEnv("DISCORD_ROLE_OWNER"),
    ...roleIdsFromEnv("DISCORD_ROLE_AUFSICHT"),
  ];
  return memberRoles.some((r) => staffIds.includes(r));
}

/** Prueft, ob eine Discord-Guild-Mitgliederrolle-Liste eine der konfigurierten Owner-Rollen enthaelt. */
export function hasOwnerRole(memberRoles: string[]): boolean {
  const ownerIds = roleIdsFromEnv("DISCORD_ROLE_OWNER");
  return memberRoles.some((r) => ownerIds.includes(r));
}

export function buildAkteEmbedForDiscord(
  member: Awaited<ReturnType<typeof prisma.member.findUnique>>,
  loans: Array<{ item: { name: string }; status: string; borrowedAt: Date; returnedAt: Date | null }>
) {
  if (!member) {
    return {
      title: "Keine Akte gefunden",
      description: "Für diesen Discord-Account existiert noch keine Akte.",
      color: 0xf2545b,
    };
  }

  const active = loans.filter((l) => l.status === LOAN_STATUS.ACTIVE);
  const frequency = new Map<string, number>();
  for (const loan of loans) {
    frequency.set(loan.item.name, (frequency.get(loan.item.name) ?? 0) + 1);
  }
  const favorite = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    title: `📁 Akte — ${member.displayName}`,
    color: 0xf2b544,
    fields: [
      { name: "Status", value: member.status, inline: true },
      { name: "Rolle", value: member.role, inline: true },
      { name: "Minecraft-Name", value: member.minecraftName || "-", inline: true },
      { name: "Monatliche Gebühr", value: formatCoins(member.monthlyFee), inline: true },
      { name: "Ausleihen insgesamt", value: String(loans.length), inline: true },
      { name: "Aktuell ausgeliehen", value: String(active.length), inline: true },
      {
        name: "Lieblings-Item",
        value: favorite ? `${favorite[0]} (${favorite[1]}x)` : "-",
        inline: true,
      },
      {
        name: "Aktuelle Ausleihen",
        value:
          active.length > 0
            ? active.map((l) => `• ${l.item.name} (seit ${l.borrowedAt.toLocaleDateString("de-DE")})`).join("\n")
            : "Keine",
      },
    ],
    footer: { text: `Discord-ID: ${member.discordId}` },
  };
}

export { LOAN_CHANNEL, ROLES };
