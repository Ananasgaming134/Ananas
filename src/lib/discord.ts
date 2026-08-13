import { ROLES, type RoleValue } from "@/lib/constants";

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
  payload: { content?: string; embeds?: unknown[] }
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
