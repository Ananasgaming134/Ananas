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
export const BORROW_PREFIX = "leihcenter_borrow:";
export const RETURN_PREFIX = "leihcenter_return:";

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
  };
};

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
