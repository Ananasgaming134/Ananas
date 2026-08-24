import { prisma } from "@/lib/prisma";
import {
  ADMIN_ROLE_ID,
  TEAMLEITUNG_ROLE_ID,
  fetchGuildMembersWithRole,
  roleIdsFromEnv,
  type DiscordGuildMember,
} from "@/lib/discord";
import { MEMBER_STATUS, ROLES } from "@/lib/constants";

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

async function membersFromDb(role: string): Promise<TeamMember[]> {
  const rows = await prisma.member.findMany({
    where: { role, status: MEMBER_STATUS.ACTIVE },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((m) => ({
    discordId: m.discordId,
    displayName: m.displayName,
    username: m.username,
    avatarUrl: m.avatarUrl,
  }));
}

async function membersFromDiscordRole(envVarName: string): Promise<TeamMember[] | null> {
  return membersFromRoleIds(roleIdsFromEnv(envVarName));
}

async function membersFromRoleIds(roleIds: string[]): Promise<TeamMember[] | null> {
  if (roleIds.length === 0) return null;

  const seen = new Set<string>();
  const result: TeamMember[] = [];
  for (const roleId of roleIds) {
    const members = await fetchGuildMembersWithRole(roleId);
    if (members === null) return null;
    for (const m of members as DiscordGuildMember[]) {
      if (seen.has(m.discordId)) continue;
      seen.add(m.discordId);
      result.push(m);
    }
  }
  return result;
}

/**
 * Baut die Team-Anzeige fuer die Startseite. Owner/Aufsicht koennen immer
 * aus unserer eigenen Mitglieder-Akte kommen (die loggen sich ja hier ein).
 * Developer/Developer-Leitung haben keinen App-Login-Zweck und muessen
 * daher live von Discord kommen - das braucht das privilegierte "Server
 * Members Intent" *und* die jeweiligen Rollen-IDs in .env. Fehlt eines von
 * beidem, wird die Gruppe einfach weggelassen statt einen Fehler zu zeigen.
 */
export async function getTeamGroups(): Promise<TeamGroup[]> {
  const [owner, teamleitung, admin, developerLeitung, developer, aufsicht] = await Promise.all([
    membersFromDiscordRole("DISCORD_ROLE_OWNER").then((v) => v ?? membersFromDb(ROLES.OWNER)),
    membersFromRoleIds([TEAMLEITUNG_ROLE_ID]),
    membersFromRoleIds([ADMIN_ROLE_ID]),
    membersFromDiscordRole("DISCORD_ROLE_DEVELOPER_LEITUNG"),
    membersFromDiscordRole("DISCORD_ROLE_DEVELOPER"),
    membersFromDiscordRole("DISCORD_ROLE_AUFSICHT").then((v) => v ?? membersFromDb(ROLES.AUFSICHT)),
  ]);

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
  return rangfolge
    .map((group) => ({
      ...group,
      members: group.members.filter((m) => {
        if (bereitsGezeigt.has(m.discordId)) return false;
        bereitsGezeigt.add(m.discordId);
        return true;
      }),
    }))
    .filter((g) => g.members.length > 0);
}
