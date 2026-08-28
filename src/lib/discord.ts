import { ROLES, SUBSCRIPTION_PLANS, type RoleValue } from "@/lib/constants";

export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
export const DISCORD_LOG_CHANNEL_ID = process.env.DISCORD_LOG_CHANNEL_ID ?? "";
export const DISCORD_SUBSCRIPTION_CHANNEL_ID = process.env.DISCORD_SUBSCRIPTION_CHANNEL_ID ?? "";
export const DISCORD_PAYMENTS_CHANNEL_ID = process.env.DISCORD_PAYMENTS_CHANNEL_ID ?? "";

export function roleIdsFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Ticketsystem -----------------------------------------------------------
// Kanaele und Rollen fuer das Ticketsystem. Die Werte sind fest vorgegeben,
// lassen sich aber per Umgebungsvariable ueberschreiben (z.B. fuer einen
// Testserver), ohne dass dafuer Code geaendert werden muss.

/** Kanal mit dem Ticket-Panel - hier entstehen auch die privaten Ticket-Threads. */
export const TICKET_PANEL_CHANNEL_ID =
  process.env.DISCORD_TICKET_PANEL_CHANNEL_ID ?? "1540827502963068958";

/** Staff-Kanal, in dem neue Tickets zum Claimen gemeldet werden. */
export const TICKET_CLAIM_CHANNEL_ID =
  process.env.DISCORD_TICKET_CLAIM_CHANNEL_ID ?? "1540827374357057586";

/**
 * Discord-Kanal-Kategorie, unter der pro Item-Kategorie ein eigener
 * Textkanal mit dem passenden Ausleih-Panel entsteht.
 */
export const ITEM_CATEGORY_PARENT_ID =
  process.env.DISCORD_ITEM_CATEGORY_PARENT_ID ?? "1469713545225703607";

/** Kanal, in dem Abo-Start und Ablauf-Erinnerungen gemeldet werden. */
export const ABO_CHANNEL_ID = process.env.DISCORD_ABO_CHANNEL_ID ?? "1469744413495394531";

/** Kanal, in dem das Regelwerk gespiegelt wird (immer dieselbe Nachricht). */
export const RULES_CHANNEL_ID = process.env.DISCORD_RULES_CHANNEL_ID ?? "1469716521965195396";

/** Kanal fuer den Info-Text ueber das LeihCenter (Ablauf, Voraussetzungen, Preise). */
export const INFO_CHANNEL_ID =
  process.env.DISCORD_INFO_CHANNEL_ID ?? "1469744773157093386";

/** Kanal, in dem Eintraege der roten Liste dokumentiert werden. */
/**
 * Kanal fuer ueberzogene Ausleihen - wer seine Frist reissen laesst, taucht
 * hier fuer die Aufsicht sichtbar auf.
 */
export const OVERDUE_CHANNEL_ID =
  process.env.DISCORD_OVERDUE_CHANNEL_ID ?? "1541538743897563286";

export const BLACKLIST_CHANNEL_ID = process.env.DISCORD_BLACKLIST_CHANNEL_ID ?? "1469743320350851213";

/** Rolle, die Support- UND Verleih-Tickets claimen darf. */
export const TICKET_CLAIM_ROLE_ID =
  process.env.DISCORD_TICKET_CLAIM_ROLE_ID ?? "1469722757196677200";

/**
 * Admin-Rolle: hat dieselben Rechte wie ein Owner, wird aber bewusst NICHT
 * automatisch in neue Tickets gepingt (siehe ticketPingRoleIds).
 */
export const ADMIN_ROLE_ID = process.env.DISCORD_ROLE_ADMIN ?? "1541447823025901649";

/** Teamleitung - steht ueber Admin und direkt unter den Ownern. */
export const TEAMLEITUNG_ROLE_ID =
  process.env.DISCORD_ROLE_TEAMLEITUNG ?? "1514905388284379217";

/**
 * Rollen mit voller Berechtigung: Owner und Admin.
 *
 * Die Dev-Rolle stand hier frueher mit drin und hatte dadurch dieselben
 * Rechte wie ein Owner. Das war nicht gewollt - sie ist eine reine
 * Kennzeichnung ohne Sonderrechte. Wer als Dev auch verwalten soll, bekommt
 * dafuer die Owner- oder Admin-Rolle.
 */
export function ticketOwnerRoleIds(): string[] {
  const fromEnv = roleIdsFromEnv("DISCORD_TICKET_OWNER_ROLE_IDS");
  const base = fromEnv.length > 0 ? fromEnv : ["1469712028049346743"];
  return [...new Set([...base, ADMIN_ROLE_ID, ...roleIdsFromEnv("DISCORD_ROLE_OWNER")].filter(Boolean))];
}

/**
 * Rollen, die bei einem neuen Ticket angepingt werden - bewusst OHNE die
 * Admin-Rolle: Admins haben zwar alle Rechte, sollen aber nicht bei jedem
 * Ticket benachrichtigt werden.
 */
export function ticketPingRoleIds(): string[] {
  return ticketOwnerRoleIds().filter((id) => id !== ADMIN_ROLE_ID);
}

/** Aufsicht: darf claimen und Schliessanfragen stellen (nicht direkt schliessen). */
export function ticketAufsichtRoleIds(): string[] {
  return [...new Set([TICKET_CLAIM_ROLE_ID, ...roleIdsFromEnv("DISCORD_ROLE_AUFSICHT")].filter(Boolean))];
}

/** Darf diese Person Tickets claimen/verwalten? Aufsicht und Owner. */
export function canClaimTicket(memberRoles: string[]): boolean {
  if (isTicketOwner(memberRoles)) return true;
  const aufsicht = ticketAufsichtRoleIds();
  return memberRoles.some((r) => aufsicht.includes(r));
}

/** Owner duerfen Tickets auch ohne Claim direkt schliessen. */
export function isTicketOwner(memberRoles: string[]): boolean {
  return memberRoles.some((r) => ticketOwnerRoleIds().includes(r));
}

function mapRolesToLeihCenterRole(roles: string[]): RoleValue | null {
  const ownerIds = roleIdsFromEnv("DISCORD_ROLE_OWNER");
  const aufsichtIds = roleIdsFromEnv("DISCORD_ROLE_AUFSICHT");
  const kundeIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");

  if (roles.some((r) => ownerIds.includes(r))) return ROLES.OWNER;
  if (roles.some((r) => aufsichtIds.includes(r))) return ROLES.AUFSICHT;
  if (roles.some((r) => kundeIds.includes(r))) return ROLES.KUNDE;
  return null;
}

/**
 * Fragt die Server-Rollen eines Discord-Users direkt per Bot-Token ab
 * (GET /guilds/{guild}/members/{user}). Zuverlässiger als der OAuth-Scope
 * "guilds.members.read", da sie nicht vom Consent des Users abhängt und
 * keine zusätzliche Berechtigung beim Login-Screen erfordert. Der Bot muss
 * dafür lediglich Mitglied des Servers sein.
 */
export async function resolveRoleViaBot(discordUserId: string): Promise<RoleValue | null> {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return null;

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, cache: "no-store" }
  );
  if (!res.ok) return null; // 404 = nicht (mehr) auf dem Server

  const member = (await res.json()) as { roles?: string[] };
  return mapRolesToLeihCenterRole(member.roles ?? []);
}

/**
 * Fallback-Variante über den OAuth-Access-Token des Users selbst (benötigt
 * den Scope "guilds.members.read"). Wird nur genutzt, falls kein Bot-Token
 * konfiguriert ist.
 */
export async function resolveRoleFromDiscord(accessToken: string): Promise<RoleValue | null> {
  if (!DISCORD_GUILD_ID) return null;

  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );
  if (!res.ok) return null;

  const member = (await res.json()) as { roles?: string[] };
  return mapRolesToLeihCenterRole(member.roles ?? []);
}

/**
 * Bevorzugt Bot-Token-Abfrage, fällt sonst auf den OAuth-Scope zurück.
 */
export async function resolveRole(discordUserId: string, accessToken?: string): Promise<RoleValue | null> {
  if (DISCORD_BOT_TOKEN) return resolveRoleViaBot(discordUserId);
  if (accessToken) return resolveRoleFromDiscord(accessToken);
  return null;
}

export type RoleCheckResult =
  | { status: "valid"; role: RoleValue }
  | { status: "revoked" } // eindeutig bestaetigt: keine gueltige Rolle mehr / Server verlassen
  | { status: "error" }; // Pruefung fehlgeschlagen (Rate-Limit, Netzwerk) - nicht als Entzug werten

/**
 * Fuer die periodische Live-Pruefung waehrend einer aktiven Sitzung (siehe
 * /api/auth/role-check). Unterscheidet bewusst zwischen "eindeutig keine
 * Berechtigung mehr" (404 = Server verlassen, oder keine passende Rolle) und
 * "Pruefung fehlgeschlagen" (Discord-API nicht erreichbar/Rate-Limit) - nur
 * ersteres darf zum automatischen Abmelden fuehren, sonst wuerde ein
 * kurzzeitiger API-Ausfall alle eingeloggten Nutzer rauswerfen.
 */
export async function checkRoleLive(discordUserId: string): Promise<RoleCheckResult> {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return { status: "error" };

  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, cache: "no-store" }
    );
    if (res.status === 404) return { status: "revoked" };
    if (!res.ok) return { status: "error" };

    const member = (await res.json()) as { roles?: string[] };
    const role = mapRolesToLeihCenterRole(member.roles ?? []);
    return role ? { status: "valid", role } : { status: "revoked" };
  } catch {
    return { status: "error" };
  }
}

/**
 * Sendet eine Direktnachricht (DM) an einen Discord-User per Bot-Token.
 * Discord erfordert dafuer zuerst das Anlegen/Abrufen eines DM-Kanals.
 * Schlaegt z.B. fehl, wenn die Person DMs von Server-Mitgliedern deaktiviert
 * hat oder den Bot blockiert hat - Aufrufer sollten das nicht als kritischen
 * Fehler behandeln, nur die Erinnerung ist dann nicht angekommen.
 */
export async function sendDiscordDirectMessage(
  discordUserId: string,
  payload: { content?: string; embeds?: unknown[]; components?: unknown[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const channelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!channelRes.ok) {
    return { ok: false, error: `DM-Kanal konnte nicht erstellt werden (${channelRes.status}).` };
  }
  const channel = (await channelRes.json()) as { id: string };

  const messageRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!messageRes.ok) {
    return { ok: false, error: `Nachricht konnte nicht gesendet werden (${messageRes.status}).` };
  }
  return { ok: true };
}

/**
 * Vergibt eine Discord-Server-Rolle live per Bot-Token
 * (PUT /guilds/{guild}/members/{user}/roles/{role}). Wird bei Annahme einer
 * Kunden-Bewerbung genutzt, damit die Person sofort die Kunde-Rolle (und
 * damit Zugriff aufs LeihCenter) bekommt, ohne dass das jemand manuell in
 * Discord nachtragen muss. Schlaegt z.B. fehl, wenn die Person den Server
 * verlassen hat oder der Bot keine Berechtigung dafuer hat.
 */
export async function grantGuildRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: "PUT", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );
  if (!res.ok && res.status !== 204) {
    return { ok: false, error: `Rolle konnte nicht vergeben werden (${res.status}).` };
  }
  return { ok: true };
}

/**
 * Entzieht eine Discord-Server-Rolle live per Bot-Token
 * (DELETE /guilds/{guild}/members/{user}/roles/{role}). Gegenstueck zu
 * grantGuildRole - wird genutzt, wenn ein Abo ablaeuft oder die
 * Zahlungsfrist nach der Rollenvergabe verstreicht (siehe
 * src/lib/accessControl.ts). Ein 404 bedeutet, dass die Person den Server
 * schon verlassen hat bzw. die Rolle ohnehin nicht mehr hat - das ist fuer
 * uns dasselbe Ergebnis und wird deshalb als Erfolg gewertet.
 */
export async function revokeGuildRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: "DELETE", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );
  if (res.ok || res.status === 204 || res.status === 404) return { ok: true };
  return { ok: false, error: `Rolle konnte nicht entzogen werden (${res.status}).` };
}

/**
 * Legt einen Textkanal fuer eine Item-Kategorie an. Sichtbarkeit erbt der
 * Kanal von der uebergeordneten Kanal-Kategorie (Discord-Standard), damit die
 * Rechte zentral dort gepflegt werden koennen - zusaetzlich wird die
 * Kunde-Rolle explizit freigeschaltet, falls @everyone dort gesperrt ist.
 */
export async function createCategoryChannel(
  guildId: string,
  parentId: string,
  name: string,
  visibleRoleIds: string[]
): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const overwrites = visibleRoleIds.map((roleId) => ({
    id: roleId,
    type: 0, // ROLE
    allow: String((1 << 10) | (1 << 16)), // Kanal sehen + Verlauf lesen
  }));

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: discordChannelName(name),
      type: 0,
      parent_id: parentId,
      permission_overwrites: overwrites.length > 0 ? overwrites : undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Kanal konnte nicht erstellt werden (${res.status}): ${text.slice(0, 150)}` };
  }
  const channel = (await res.json()) as { id: string };
  return { ok: true, channelId: channel.id };
}

/** Discord erlaubt in Kanalnamen nur Kleinbuchstaben, Zahlen und Bindestriche. */
export function discordChannelName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "kategorie"
  );
}

/** Benennt einen Kanal um - wird genutzt, wenn eine Kategorie umbenannt wird. */
export async function renameChannel(channelId: string, name: string): Promise<{ ok: boolean }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false };
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: discordChannelName(name) }),
  }).catch(() => null);
  return { ok: Boolean(res?.ok) };
}

/** Loescht einen Kanal - beim Entfernen einer Kategorie. */
export async function deleteChannel(channelId: string): Promise<{ ok: boolean }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false };
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  }).catch(() => null);
  return { ok: Boolean(res?.ok) };
}

// Discord-Kanal-/Berechtigungs-Konstanten fuers Ticket-System (siehe
// src/lib/tickets.ts). Werte aus der offiziellen Discord-API-Dokumentation.
const CHANNEL_TYPE_GUILD_TEXT = 0;
const CHANNEL_TYPE_GUILD_CATEGORY = 4;
const OVERWRITE_TYPE_ROLE = 0;
const OVERWRITE_TYPE_MEMBER = 1;
const PERM_VIEW_CHANNEL = 1 << 10; // 1024
const PERM_SEND_MESSAGES = 1 << 11; // 2048
const PERM_READ_HISTORY = 1 << 16; // 65536
const TICKET_ALLOW = String(PERM_VIEW_CHANNEL | PERM_SEND_MESSAGES | PERM_READ_HISTORY);

type PermissionOverwrite = { id: string; type: number; allow?: string; deny?: string };

/**
 * Legt eine private Kanal-Kategorie an - @everyone sieht sie nicht. Wird
 * einmalig fuer die Ticket-Kanaele eines Servers aufgerufen, die ID landet
 * in BotDeployment.ticketCategoryId.
 */
export async function createTicketCategory(
  guildId: string,
  name = "Tickets"
): Promise<{ ok: true; categoryId: string } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      type: CHANNEL_TYPE_GUILD_CATEGORY,
      permission_overwrites: [{ id: guildId, type: OVERWRITE_TYPE_ROLE, deny: String(PERM_VIEW_CHANNEL) }],
    }),
  });
  if (!res.ok) return { ok: false, error: `Kategorie konnte nicht erstellt werden (${res.status}).` };
  const channel = (await res.json()) as { id: string };
  return { ok: true, categoryId: channel.id };
}

/**
 * Erstellt einen privaten Ticket-Kanal unter der angegebenen Kategorie -
 * standardmaessig NUR sichtbar fuer die eroeffnende Person und die
 * Owner-Rolle. Claim-Rollen bekommen bewusst KEINEN pauschalen Zugriff mehr
 * (Warteschlangen-Modell: erst wer claimt, bekommt individuellen Zugriff -
 * siehe grantChannelMemberAccess und createTicketCore in tickets.ts).
 */
export async function createTicketChannel(
  guildId: string,
  categoryId: string | null,
  channelName: string,
  applicantDiscordId: string
): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const ownerRoleId = roleIdsFromEnv("DISCORD_ROLE_OWNER")[0];
  const overwrites: PermissionOverwrite[] = [
    { id: guildId, type: OVERWRITE_TYPE_ROLE, deny: String(PERM_VIEW_CHANNEL) },
    { id: applicantDiscordId, type: OVERWRITE_TYPE_MEMBER, allow: TICKET_ALLOW },
  ];
  if (ownerRoleId) {
    overwrites.push({ id: ownerRoleId, type: OVERWRITE_TYPE_ROLE, allow: TICKET_ALLOW });
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: channelName.slice(0, 100),
      type: CHANNEL_TYPE_GUILD_TEXT,
      parent_id: categoryId ?? undefined,
      permission_overwrites: overwrites,
    }),
  });
  if (!res.ok) return { ok: false, error: `Ticket-Kanal konnte nicht erstellt werden (${res.status}).` };
  const channel = (await res.json()) as { id: string };
  return { ok: true, channelId: channel.id };
}

const CHANNEL_TYPE_PRIVATE_THREAD = 12;

/**
 * Legt einen PRIVATEN Thread unter einem bestehenden Kanal an - Tickets
 * laufen als Threads statt als eigene Kanaele, damit die Kanalliste nicht
 * zuwaechst. Private Threads sind nur fuer explizit hinzugefuegte Mitglieder
 * (plus Rollen mit "Private Threads verwalten") sichtbar; der Ersteller wird
 * direkt per addThreadMember aufgenommen.
 */
export async function createTicketThread(
  parentChannelId: string,
  threadName: string,
  applicantDiscordId: string
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/channels/${parentChannelId}/threads`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: threadName.slice(0, 100),
      type: CHANNEL_TYPE_PRIVATE_THREAD,
      invitable: false,
      auto_archive_duration: 10080, // 7 Tage
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Ticket-Thread konnte nicht erstellt werden (${res.status}): ${text.slice(0, 150)}` };
  }

  const thread = (await res.json()) as { id: string };
  await addThreadMember(thread.id, applicantDiscordId).catch(() => {});
  return { ok: true, threadId: thread.id };
}

/** Fuegt eine Person einem privaten Thread hinzu (Claim, "/ticket add"). */
export async function addThreadMember(
  threadId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/channels/${threadId}/thread-members/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok && res.status !== 204) {
    return { ok: false, error: `Konnte Person nicht zum Thread hinzufügen (${res.status}).` };
  }
  return { ok: true };
}

/** Archiviert bzw. sperrt einen Thread - beim Schliessen eines Tickets. */
export async function archiveThread(threadId: string): Promise<{ ok: boolean }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false };
  const res = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true, locked: true }),
  });
  return { ok: res.ok };
}

type FetchedMessage = {
  id: string;
  content?: string;
  timestamp: string;
  author?: { username?: string; global_name?: string | null; bot?: boolean };
  attachments?: Array<{ url: string; filename: string }>;
};

/**
 * Liest den kompletten Verlauf eines Kanals/Threads aus (aelteste zuerst) und
 * baut daraus ein reines Text-Transkript. Wird beim Schliessen eines Tickets
 * gesichert, damit der Nachweis erhalten bleibt, auch wenn der Thread spaeter
 * archiviert oder geloescht wird.
 */
export async function fetchChannelTranscript(channelId: string): Promise<string | null> {
  if (!DISCORD_BOT_TOKEN) return null;

  const collected: FetchedMessage[] = [];
  let before: string | undefined;

  // Discord liefert maximal 100 Nachrichten pro Aufruf, neueste zuerst.
  // Deckel bei 1000, damit ein ausuferndes Ticket nicht endlos paginiert.
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      cache: "no-store",
    }).catch(() => null);
    if (!res || !res.ok) break;

    const batch = (await res.json()) as FetchedMessage[];
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  if (collected.length === 0) return null;

  return collected
    .reverse()
    .map((msg) => {
      const author = msg.author?.global_name || msg.author?.username || "Unbekannt";
      const time = new Date(msg.timestamp).toLocaleString("de-DE");
      const attachments = (msg.attachments ?? []).map((a) => `[Anhang: ${a.filename}]`).join(" ");
      const body = [msg.content?.trim(), attachments].filter(Boolean).join(" ");
      return `[${time}] ${author}: ${body || "(keine Textnachricht)"}`;
    })
    .join("\n");
}

/**
 * Gibt einer einzelnen Person individuellen Zugriff auf einen Ticket-Kanal -
 * genutzt beim Claimen (die claimende Aufsichtsperson) und beim
 * "/ticket add"-Befehl (weitere Personen, nur von Owner/aktuellem Claimer
 * ausloesbar, siehe route.ts).
 */
export async function grantChannelMemberAccess(
  channelId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: OVERWRITE_TYPE_MEMBER, allow: TICKET_ALLOW }),
  });
  if (!res.ok && res.status !== 204) return { ok: false, error: `Zugriff konnte nicht vergeben werden (${res.status}).` };
  return { ok: true };
}

/**
 * Legt (falls noch nicht vorhanden) den staff-only Warteschlangen-Kanal an,
 * in dem pro neuem Ticket eine Nachricht mit Claim-Button erscheint - nur
 * fuer die konfigurierten Claim-Rollen (beider Kategorien) + Owner sichtbar.
 */
export async function ensureTicketQueueChannel(
  guildId: string,
  claimRoleIds: string[],
  name = "ticket-warteschlange"
): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const ownerRoleId = roleIdsFromEnv("DISCORD_ROLE_OWNER")[0];
  const overwrites: PermissionOverwrite[] = [
    { id: guildId, type: OVERWRITE_TYPE_ROLE, deny: String(PERM_VIEW_CHANNEL) },
    ...claimRoleIds.map((roleId) => ({ id: roleId, type: OVERWRITE_TYPE_ROLE, allow: TICKET_ALLOW })),
  ];
  if (ownerRoleId && !claimRoleIds.includes(ownerRoleId)) {
    overwrites.push({ id: ownerRoleId, type: OVERWRITE_TYPE_ROLE, allow: TICKET_ALLOW });
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, type: CHANNEL_TYPE_GUILD_TEXT, permission_overwrites: overwrites }),
  });
  if (!res.ok) return { ok: false, error: `Warteschlangen-Kanal konnte nicht erstellt werden (${res.status}).` };
  const channel = (await res.json()) as { id: string };
  return { ok: true, channelId: channel.id };
}

/**
 * Entzieht der eroeffnenden Person das Schreibrecht in ihrem Ticket-Kanal
 * (Ansehen bleibt moeglich) - genutzt beim Schliessen eines Tickets. Der
 * Kanal wird bewusst NICHT geloescht, bleibt also als Verlauf erhalten.
 */
export async function revokeChannelSendPermission(
  channelId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: OVERWRITE_TYPE_MEMBER,
      allow: String(PERM_VIEW_CHANNEL),
      deny: String(PERM_SEND_MESSAGES),
    }),
  });
  if (!res.ok && res.status !== 204) return { ok: false, error: `Konnte Kanal nicht sperren (${res.status}).` };
  return { ok: true };
}

/**
 * Schaltet die Sichtbarkeit eines Kanals fuer eine Rolle an/aus - genutzt
 * fuer den "Tickets sichtbar fuer Kunden"-Schalter des Ticket-Panels.
 */
export async function setChannelRoleVisibility(
  channelId: string,
  roleId: string,
  visible: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: "Kein Bot-Token konfiguriert." };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/permissions/${roleId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      visible
        ? { type: OVERWRITE_TYPE_ROLE, allow: String(PERM_VIEW_CHANNEL), deny: "0" }
        : { type: OVERWRITE_TYPE_ROLE, allow: "0", deny: String(PERM_VIEW_CHANNEL) }
    ),
  });
  if (!res.ok && res.status !== 204) {
    return { ok: false, error: `Sichtbarkeit konnte nicht geändert werden (${res.status}).` };
  }
  return { ok: true };
}

export type DiscordGuildMember = {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type RawGuildMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  roles?: string[];
};

/**
 * Listet alle Mitglieder der Guild mit einer bestimmten Rolle auf (paginiert
 * ueber GET /guilds/{guild}/members). Benoetigt zusaetzlich zum Bot-Token
 * das privilegierte "Server Members Intent", das im Discord Developer
 * Portal unter Bot -> Privileged Gateway Intents manuell aktiviert werden
 * muss (kann nicht per API gesetzt werden). Gibt null zurueck, wenn die
 * Anfrage fehlschlaegt (z.B. Intent nicht aktiviert) - Aufrufer sollten in
 * dem Fall auf die lokal bekannten Mitglieder zurueckfallen.
 */
export async function fetchGuildMembersWithRole(roleId: string): Promise<DiscordGuildMember[] | null> {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return null;

  const matched: DiscordGuildMember[] = [];
  let after = "0";

  while (true) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, cache: "no-store" }
    );
    if (!res.ok) return null;

    const batch = (await res.json()) as RawGuildMember[];
    if (batch.length === 0) break;

    for (const m of batch) {
      if (!m.user || !m.roles?.includes(roleId)) continue;
      matched.push({
        discordId: m.user.id,
        username: m.user.username,
        displayName: m.user.global_name ?? m.user.username,
        avatarUrl: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
          : null,
      });
    }

    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user!.id;
  }

  return matched;
}

/**
 * Registriert alle Slash-Befehle ("/akte", "/setup") fuer eine Guild
 * (guild-spezifisch, also sofort verfuegbar statt bis zu einer Stunde wie
 * bei globalen Befehlen). Discord ersetzt bei PUT IMMER die komplette
 * Befehlsliste der Guild - deshalb muessen hier alle Befehle auf einmal
 * mitgeschickt werden, sonst wuerde ein zweiter Aufruf den ersten Befehl
 * wieder loeschen. Muss einmal pro Server aufgerufen werden. Reagiert erst,
 * sobald die Interactions Endpoint URL im Discord Developer Portal auf eine
 * oeffentlich erreichbare HTTPS-URL gesetzt ist.
 */
export async function registerSlashCommands(guildId: string): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.AUTH_DISCORD_ID ?? "";
  if (!appId || !DISCORD_BOT_TOKEN) return { ok: false, error: "App-ID oder Bot-Token fehlt." };

  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        name: "akte",
        description: "Zeigt die Akte eines Mitglieds an (nur für Aufsicht/Owner, nur für dich sichtbar)",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "Für wen die Akte angezeigt werden soll",
            required: true,
          },
        ],
      },
      {
        name: "wortketten-reset",
        description: "Setzt das Wortkettenspiel in diesem Kanal zurück (nur für Aufsicht/Owner)",
      },
      {
        name: "meine-ausleihen",
        description: "Zeigt deine aktuell ausgeliehenen Items mit Rückgabe-Button (nur für dich sichtbar)",
      },
      {
        name: "bewerben",
        description: "Bewirb dich ums LeihCenter (Kunde werden)",
      },
      {
        name: "setup",
        description: "Richtet die LeihCenter-Panels in diesem Kanal ein (nur Owner)",
        options: [
          {
            type: 1, // SUB_COMMAND
            name: "item-panel",
            description: "Postet/aktualisiert das Ausleih-Panel in diesem Kanal",
            options: [
              {
                type: 8, // ROLE
                name: "rolle",
                description: "Rolle, die hier ausleihen darf (nur bei erster Einrichtung nötig)",
                required: false,
              },
            ],
          },
          {
            type: 1, // SUB_COMMAND
            name: "status-panel",
            description: "Postet/aktualisiert das Status-Panel (aktuell ausgeliehen) in diesem Kanal",
          },
          {
            type: 1, // SUB_COMMAND
            name: "ticket-panel",
            description: "Postet/aktualisiert das Ticket-Panel (Support/Bewerbung) in diesem Kanal",
          },
        ],
      },
      {
        name: "setup-tickets",
        description: "Postet das Ticket-Panel (Support + Verleih-Service) in den Ticket-Kanal (nur Owner)",
      },
      {
        // Eigener Befehl zusaetzlich zu "/ticket schliessen": ein blosser
        // Unterbefehl von "/ticket" kann mit gleichnamigen Befehlen anderer
        // Bots kollidieren und taucht dann im Client nicht auf.
        name: "ticket-schliessen",
        description: "Stellt die Schließanfrage für dieses Ticket (Aufsicht/Owner)",
      },
      {
        // Kundenbefehle bewusst als eigenstaendige Befehle statt als
        // Unterbefehle - so koennen sie nicht mit anderen Bots kollidieren.
        name: "guthaben",
        description: "Zeigt dein Guthaben (nur für dich sichtbar)",
      },
      {
        name: "profil",
        description: "Zeigt dein Profil: Abo, Laufzeit, Guthaben (nur für dich sichtbar)",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "Fremdes Profil ansehen (nur Aufsicht/Admin/Owner)",
            required: false,
          },
        ],
      },
      {
        name: "verlaengern",
        description: "Abo abschließen oder verlängern — Paket frei wählbar, direkt vom Guthaben",
        options: [
          {
            type: 3, // STRING
            name: "paket",
            description: "Welches Paket (leer lassen, um aus der Liste zu wählen)",
            required: false,
            choices: SUBSCRIPTION_PLANS.map((p) => ({ name: p.label, value: p.id })),
          },
        ],
      },
      {
        name: "ticket",
        description: "Ticket-Verwaltung (nur für Aufsicht/Owner)",
        options: [
          {
            type: 1, // SUB_COMMAND
            name: "add",
            description: "Fügt eine Person zum aktuellen Ticket-Kanal hinzu (nur Owner/aktueller Claimer)",
            options: [{ type: 6, name: "user", description: "Wer hinzugefügt werden soll", required: true }], // USER
          },
          {
            type: 1, // SUB_COMMAND
            name: "schliessen",
            description: "Schließt dieses Ticket (Owner sofort, Aufsicht per Anfrage an den Ersteller)",
          },
        ],
      },
      {
        name: "statistik",
        description: "Zeigt die Ausleih-Statistik (nur für dich sichtbar)",
        options: [
          {
            type: 1, // SUB_COMMAND
            name: "allgemein",
            description: "Die gefragtesten Items und Kategorien im ganzen LeihCenter",
          },
          {
            type: 1, // SUB_COMMAND
            name: "meine",
            description: "Deine eigenen Ausleihen und Lieblings-Items",
          },
        ],
      },
      {
        name: "verifizieren",
        description: "Verknüpft deinen Minecraft-Account mit deinem Konto (Pflicht fürs Ausleihen)",
        options: [
          {
            type: 3, // STRING
            name: "minecraft-name",
            description: "Dein exakter Minecraft-Name",
            required: true,
          },
        ],
      },
      {
        name: "ausleihen",
        description: "Alle aktuell ausgeliehenen Items mit Ausbuchen-Button (nur für Aufsicht/Owner)",
      },
      {
        name: "abo",
        description: "Abo-Verwaltung (nur für Aufsicht/Owner)",
        options: [
          {
            type: 1, // SUB_COMMAND
            name: "setzen",
            description: "Setzt das Abo-Paket eines Mitglieds",
            options: [
              { type: 6, name: "user", description: "Für wen das Paket gesetzt wird", required: true }, // USER
              {
                type: 3, // STRING
                name: "paket",
                description: "Welches Paket",
                required: true,
                choices: SUBSCRIPTION_PLANS.map((p) => ({ name: p.label, value: p.id })),
              },
            ],
          },
          {
            type: 1, // SUB_COMMAND
            name: "bestaetigen",
            description: "Bestätigt den offenen Abo-Antrag (im Abo-Ticket oder mit Person)",
            options: [
              { type: 6, name: "user", description: "Wessen Antrag (nur außerhalb des Tickets nötig)", required: false },
            ],
          },
          {
            type: 1, // SUB_COMMAND
            name: "ablehnen",
            description: "Lehnt den offenen Abo-Antrag ab (im Abo-Ticket oder mit Person)",
            options: [
              { type: 6, name: "user", description: "Wessen Antrag (nur außerhalb des Tickets nötig)", required: false },
              { type: 3, name: "grund", description: "Warum abgelehnt wird", required: false },
            ],
          },
        ],
      },
    ]),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Discord antwortete mit ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}
