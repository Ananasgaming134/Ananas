import type { Member } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import {
  DISCORD_GUILD_ID,
  revokeGuildRole,
  roleIdsFromEnv,
  sendDiscordDirectMessage,
} from "@/lib/discord";
import { MEMBER_STATUS, ROLES, SITE_NAME, hasAtLeastRole } from "@/lib/constants";

/**
 * Zahlungsfrist nach Vergabe der Kunde-Rolle: wer die Rolle bekommt, aber
 * innerhalb dieser Zeit kein Abo abschliesst, verliert die Rolle automatisch
 * wieder (siehe enforceAccessRules).
 */
export const KUNDE_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Ein Abo gilt als aktiv, solange feePaidUntil in der Zukunft liegt. Eine
 * laufende Pause zaehlt ebenfalls als aktiv - pausierte Kunden zahlen fuer
 * die Pausenzeit nicht und duerfen deshalb nicht rausgeworfen werden, die
 * Zeit wird beim Fortsetzen hinten angehaengt (resumeMemberCore).
 */
export function hasActiveSubscription(
  member: Pick<Member, "feePaidUntil" | "pausedAt">,
  now = new Date()
): boolean {
  if (member.pausedAt) return true;
  return Boolean(member.feePaidUntil && member.feePaidUntil > now);
}

/**
 * Nur Kunden unterliegen dem Abo-Zwang. Aufsicht/Owner behalten ihren Zugang
 * unabhaengig vom Abo - sonst wuerde sich das Team selbst aussperren.
 */
function isStaff(member: Pick<Member, "role">): boolean {
  return hasAtLeastRole(member.role, ROLES.AUFSICHT);
}

/**
 * Entzieht in Discord alle konfigurierten Kunde-Rollen und setzt den Member
 * lokal auf REVOKED. Idempotent: ist der Zugang schon entzogen, passiert
 * nichts weiter. Die Discord-Seite ist best-effort - schlaegt sie fehl (Bot
 * offline, fehlende Berechtigung), wird der Zugang zur Website trotzdem
 * gesperrt, damit die Sperre nie an Discord haengen bleibt.
 */
export async function revokeAccessAndRole(
  member: Member,
  reason: string,
  action: string
): Promise<void> {
  if (member.status === MEMBER_STATUS.REVOKED || member.status === MEMBER_STATUS.BANNED) return;

  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  if (DISCORD_GUILD_ID && kundeRoleIds.length > 0) {
    for (const roleId of kundeRoleIds) {
      const result = await revokeGuildRole(DISCORD_GUILD_ID, member.discordId, roleId).catch(
        (err) => ({ ok: false as const, error: String(err) })
      );
      if (!result.ok) {
        console.error(`[access] Rolle ${roleId} fuer ${member.username} nicht entzogen:`, result.error);
      }
    }
  }

  await prisma.member.update({
    where: { id: member.id },
    data: {
      status: MEMBER_STATUS.REVOKED,
      revokedAt: new Date(),
      revokedReason: reason,
      graceUntil: null,
    },
  });

  await logAction({ targetId: member.id, action, details: reason });

  await sendDiscordDirectMessage(member.discordId, {
    content: `🔒 **${SITE_NAME}** — dein Zugang wurde beendet.\nGrund: ${reason}\n\nSobald wieder ein Abo hinterlegt ist, bekommst du die Rolle zurück.`,
  }).catch(() => {});
}

/**
 * Startet die Zahlungsfrist, sobald jemand die Kunde-Rolle bekommt und noch
 * kein aktives Abo hat. Laeuft bereits eine Frist, bleibt sie unveraendert -
 * sonst koennte man sie durch wiederholtes Rollen-Neuvergeben endlos
 * verlaengern.
 */
export async function startGracePeriodIfNeeded(memberId: string): Promise<void> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || isStaff(member) || member.graceUntil) return;
  if (hasActiveSubscription(member)) return;

  await prisma.member.update({
    where: { id: memberId },
    data: { graceUntil: new Date(Date.now() + KUNDE_GRACE_MS) },
  });

  await logAction({
    targetId: memberId,
    action: "GRACE_PERIOD_STARTED",
    details: "Kunde-Rolle vergeben - Abo muss innerhalb von 3 Stunden abgeschlossen werden.",
  });

  await sendDiscordDirectMessage(member.discordId, {
    content:
      `👋 **${SITE_NAME}** — willkommen!\n\n` +
      "Du hast jetzt die Kunden-Rolle. Damit sie bestehen bleibt, muss innerhalb der " +
      "**nächsten 3 Stunden** ein Abo abgeschlossen sein.\n\n" +
      "Dafür lädst du Guthaben auf die Business-Card **BC-584289** (Verwendungszweck: `Verleih <deine Kundennummer>`) " +
      "und die Aufsicht bucht davon dein Paket ab. Ohne Abo wird die Rolle automatisch wieder entzogen.",
  }).catch(() => {});
}

export type EnforceResult = {
  expired: number;
  graceExpired: number;
  roleLost: number;
};

/**
 * Durchgaengige Durchsetzung der Zugangsregeln - laeuft per Cron jede Minute
 * und deckt drei Faelle ab:
 *
 * 1. Abo abgelaufen -> Discord-Rolle entziehen und Zugang sperren.
 * 2. Zahlungsfrist (3h nach Rollenvergabe) verstrichen, immer noch kein Abo
 *    -> dasselbe.
 * 3. Rolle wurde in Discord manuell entfernt -> Zugang lokal sperren. Der
 *    Gateway-Handler macht das normalerweise sofort; dieser Durchlauf faengt
 *    die Faelle ab, in denen die App zu dem Zeitpunkt nicht lief.
 *
 * Staff (Aufsicht/Owner) ist von 1 und 2 ausgenommen. Nichts davon trifft
 * bereits gesperrte oder gebannte Mitglieder erneut.
 */
export async function enforceAccessRules(): Promise<EnforceResult> {
  const now = new Date();
  const result: EnforceResult = { expired: 0, graceExpired: 0, roleLost: 0 };

  const members = await prisma.member.findMany({
    where: { status: MEMBER_STATUS.ACTIVE },
  });

  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  const canCheckRoles = Boolean(DISCORD_GUILD_ID && kundeRoleIds.length > 0);

  for (const member of members) {
    if (isStaff(member)) continue;

    // 1. Abo abgelaufen (feePaidUntil war gesetzt, liegt aber in der Vergangenheit)
    if (member.feePaidUntil && member.feePaidUntil <= now && !member.pausedAt) {
      await revokeAccessAndRole(
        member,
        `Abo am ${member.feePaidUntil.toLocaleDateString("de-DE")} abgelaufen und nicht verlängert.`,
        "ACCESS_REVOKED_SUBSCRIPTION_EXPIRED"
      );
      result.expired += 1;
      continue;
    }

    // 1b. Rolle vorhanden, aber noch nie ein Abo und auch keine laufende
    // Frist (z.B. Rolle wurde vergeben, waehrend die App nicht lief). Statt
    // sofort zu sperren bekommt die Person regulaer ihre 3 Stunden.
    if (!member.feePaidUntil && !member.graceUntil && !member.pausedAt) {
      await startGracePeriodIfNeeded(member.id);
      continue;
    }

    // 2. Zahlungsfrist nach Rollenvergabe verstrichen, immer noch kein Abo
    if (member.graceUntil && member.graceUntil <= now && !hasActiveSubscription(member, now)) {
      await revokeAccessAndRole(
        member,
        "Innerhalb von 3 Stunden nach der Rollenvergabe wurde kein Abo abgeschlossen.",
        "ACCESS_REVOKED_GRACE_EXPIRED"
      );
      result.graceExpired += 1;
      continue;
    }

    // 3. Kunde-Rolle in Discord nicht mehr vorhanden -> Zugang sperren.
    if (canCheckRoles) {
      const stillHasRole = await memberStillHasKundeRole(member.discordId, kundeRoleIds);
      if (stillHasRole === false) {
        await revokeAccessAndRole(
          member,
          "Die Kunden-Rolle wurde auf Discord entfernt.",
          "ACCESS_REVOKED_ROLE_REMOVED"
        );
        result.roleLost += 1;
      }
    }
  }

  return result;
}

// Kurzzeit-Cache fuer die serverseitige Rollenpruefung: ohne den wuerde jeder
// Seitenaufruf eine Discord-API-Abfrage ausloesen. 20s ist kurz genug, dass
// ein Rollenentzug praktisch sofort greift (der Gateway-Handler reagiert
// ohnehin in Echtzeit), und lang genug, um Rate-Limits zu vermeiden.
const ROLE_CACHE_MS = 20_000;
const roleCheckCache = new Map<string, { until: number; allowed: boolean }>();

/**
 * Serverseitige Dauerpruefung fuer jeden Seitenaufruf (siehe requireMember):
 * hat die Person in Discord keine gueltige Rolle mehr, wird der Zugang sofort
 * gesperrt. Ergebnis: true = weiterhin berechtigt. Bei fehlgeschlagener
 * Pruefung wird bewusst true zurueckgegeben, damit ein Discord-Ausfall
 * niemanden aussperrt.
 */
export async function isStillAuthorized(member: Member): Promise<boolean> {
  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  if (!DISCORD_GUILD_ID || kundeRoleIds.length === 0) return true;

  const cached = roleCheckCache.get(member.discordId);
  if (cached && cached.until > Date.now()) return cached.allowed;

  const stillHasRole = await memberStillHasKundeRole(member.discordId, kundeRoleIds);
  if (stillHasRole === null) return true; // Pruefung fehlgeschlagen - nicht aussperren

  roleCheckCache.set(member.discordId, {
    until: Date.now() + ROLE_CACHE_MS,
    allowed: stillHasRole,
  });

  if (!stillHasRole) {
    await revokeAccessAndRole(
      member,
      "Die Kunden-Rolle wurde auf Discord entfernt.",
      "ACCESS_REVOKED_ROLE_REMOVED"
    );
    return false;
  }
  return true;
}

/**
 * Prueft per Bot-Token, ob jemand noch eine der Kunde-Rollen traegt.
 * Rueckgabe null = Pruefung fehlgeschlagen (Rate-Limit/Netzwerk) - das darf
 * NIE als Entzug gewertet werden, sonst wuerde ein kurzer Discord-Ausfall
 * alle Kunden aussperren.
 */
async function memberStillHasKundeRole(
  discordId: string,
  kundeRoleIds: string[]
): Promise<boolean | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}`,
      { headers: { Authorization: `Bot ${token}` }, cache: "no-store" }
    );
    if (res.status === 404) return false; // Server verlassen
    if (!res.ok) return null;

    const data = (await res.json()) as { roles?: string[] };
    const roles = data.roles ?? [];
    // Staff-Rollen zaehlen ebenfalls als Zugangsberechtigung.
    const staffIds = [...roleIdsFromEnv("DISCORD_ROLE_OWNER"), ...roleIdsFromEnv("DISCORD_ROLE_AUFSICHT")];
    return roles.some((r) => kundeRoleIds.includes(r) || staffIds.includes(r));
  } catch {
    return null;
  }
}
