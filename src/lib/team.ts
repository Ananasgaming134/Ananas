import { prisma } from "@/lib/prisma";
import { fetchGuildMembersWithRole, roleIdsFromEnv, type DiscordGuildMember } from "@/lib/discord";
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
  const roleIds = roleIdsFromEnv(envVarName);
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
  const [owner, aufsicht, developerLeitung, developer] = await Promise.all([
    membersFromDiscordRole("DISCORD_ROLE_OWNER").then((v) => v ?? membersFromDb(ROLES.OWNER)),
    membersFromDiscordRole("DISCORD_ROLE_AUFSICHT").then((v) => v ?? membersFromDb(ROLES.AUFSICHT)),
    membersFromDiscordRole("DISCORD_ROLE_DEVELOPER_LEITUNG"),
    membersFromDiscordRole("DISCORD_ROLE_DEVELOPER"),
  ]);

  const groups: TeamGroup[] = [
    { key: "owner", label: "Owner", members: owner },
    { key: "aufsicht", label: "Aufsichtspersonen", members: aufsicht },
  ];

  if (developerLeitung && developerLeitung.length > 0) {
    groups.push({ key: "dev-leitung", label: "Developer-Leitung", members: developerLeitung });
  }
  if (developer && developer.length > 0) {
    groups.push({ key: "developer", label: "Developer", members: developer });
  }

  return groups.filter((g) => g.members.length > 0);
}
