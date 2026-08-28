import {
  ADMIN_ROLE_ID,
  TEAMLEITUNG_ROLE_ID,
  fetchGuildMembersWithRole,
  roleIdsFromEnv,
} from "@/lib/discord";

export type TeamMember = {
  discordId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type TeamGroup = {
  key: string;
  label: string;
  members: TeamMember[];
};

/**
 * Zuletzt erfolgreich von Discord geholte Team-Liste.
 *
 * Zwei Gruende dafuer: die Startseite fragt sonst bei jedem Aufruf alle
 * Server-Mitglieder ab (mehrere hundert), und wenn dieser Aufruf mal
 * fehlschlaegt, soll die Seite den letzten bekannten Stand zeigen statt
 * einen falschen. Frueher fiel sie in dem Fall auf die Rollen aus unserer
 * eigenen Datenbank zurueck - die koennen veraltet sein, dadurch standen
 * Leute im Team, die die Rolle laengst nicht mehr hatten.
 */
let zwischenspeicher: { gruppen: TeamGroup[]; bis: number } | null = null;
const CACHE_MS = 60_000;

/**
 * Verwirft den Zwischenspeicher. Wird von der Gateway-Verbindung aufgerufen,
 * sobald sich auf Discord an irgendeiner Rolle etwas aendert - dadurch steht
 * die Team-Anzeige sofort richtig, statt bis zu einer Minute alt zu sein.
 */
export function invalidateTeamCache(): void {
  zwischenspeicher = null;
}

async function membersFromRoleIds(roleIds: string[]): Promise<TeamMember[] | null> {
  const ids = roleIds.filter(Boolean);
  if (ids.length === 0) return null;

  const seen = new Set<string>();
  const result: TeamMember[] = [];
  for (const roleId of ids) {
    const members = await fetchGuildMembersWithRole(roleId);
    if (members === null) return null;
    for (const m of members) {
      if (seen.has(m.discordId)) continue;
      seen.add(m.discordId);
      result.push(m);
    }
  }
  return result;
}

/**
 * Baut die Team-Anzeige fuer die Startseite - ausschliesslich aus dem, was
 * gerade wirklich auf Discord steht. Wer die Rolle dort nicht hat, taucht
 * hier nicht auf, egal was in unserer Datenbank steht.
 */
export async function getTeamGroups(): Promise<TeamGroup[]> {
  if (zwischenspeicher && zwischenspeicher.bis > Date.now()) return zwischenspeicher.gruppen;

  const [owner, teamleitung, admin, developerLeitung, developer, aufsicht] = await Promise.all([
    membersFromRoleIds(roleIdsFromEnv("DISCORD_ROLE_OWNER")),
    membersFromRoleIds([TEAMLEITUNG_ROLE_ID]),
    membersFromRoleIds([ADMIN_ROLE_ID]),
    membersFromRoleIds(roleIdsFromEnv("DISCORD_ROLE_DEVELOPER_LEITUNG")),
    membersFromRoleIds(roleIdsFromEnv("DISCORD_ROLE_DEVELOPER")),
    membersFromRoleIds(roleIdsFromEnv("DISCORD_ROLE_AUFSICHT")),
  ]);

  // Discord war nicht erreichbar: lieber den letzten bekannten Stand zeigen
  // (oder gar nichts) als eine Liste, die nicht stimmt.
  const discordErreichbar = [owner, teamleitung, admin, developer, aufsicht].some((x) => x !== null);
  if (!discordErreichbar) return zwischenspeicher?.gruppen ?? [];

  // Reihenfolge von oben nach unten. Wer mehrere Rollen traegt, erscheint nur
  // einmal - bei der hoechsten, die zuerst kommt.
  const rangfolge: TeamGroup[] = [
    { key: "owner", label: "Owner", members: owner ?? [] },
    { key: "teamleitung", label: "Teamleitung", members: teamleitung ?? [] },
    { key: "admin", label: "Admins", members: admin ?? [] },
    { key: "dev-leitung", label: "Developer-Leitung", members: developerLeitung ?? [] },
    { key: "developer", label: "Developer", members: developer ?? [] },
    { key: "aufsicht", label: "Aufsichtspersonen", members: aufsicht ?? [] },
  ];

  const bereitsGezeigt = new Set<string>();
  const gruppen = rangfolge
    .map((group) => ({
      ...group,
      members: group.members.filter((m) => {
        if (bereitsGezeigt.has(m.discordId)) return false;
        bereitsGezeigt.add(m.discordId);
        return true;
      }),
    }))
    .filter((g) => g.members.length > 0);

  zwischenspeicher = { gruppen, bis: Date.now() + CACHE_MS };
  return gruppen;
}
