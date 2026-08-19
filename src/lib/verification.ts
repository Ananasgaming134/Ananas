import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const MOJANG_LOOKUP = "https://api.mojang.com/users/profiles/minecraft/";
const MOJANG_PROFILE = "https://sessionserver.mojang.com/session/minecraft/profile/";

export type MojangProfile = { uuid: string; name: string };

/**
 * Schlaegt einen Minecraft-Namen bei Mojang nach und liefert die UUID.
 * null = Name existiert nicht; "unavailable" = Mojang gerade nicht
 * erreichbar (darf NICHT wie "existiert nicht" behandelt werden, sonst
 * scheitert die Verifizierung bei einem API-Ausfall faelschlich).
 */
export async function lookupMinecraftName(
  name: string
): Promise<MojangProfile | null | "unavailable"> {
  try {
    const res = await fetch(`${MOJANG_LOOKUP}${encodeURIComponent(name)}`, { cache: "no-store" });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) return "unavailable";
    const data = (await res.json()) as { id?: string; name?: string };
    if (!data.id || !data.name) return null;
    return { uuid: data.id, name: data.name };
  } catch {
    return "unavailable";
  }
}

/** Aktuellen Namen zu einer bekannten UUID holen - erkennt Umbenennungen. */
export async function lookupMinecraftUuid(uuid: string): Promise<MojangProfile | null | "unavailable"> {
  try {
    const res = await fetch(`${MOJANG_PROFILE}${uuid}`, { cache: "no-store" });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) return "unavailable";
    const data = (await res.json()) as { id?: string; name?: string };
    if (!data.id || !data.name) return null;
    return { uuid: data.id, name: data.name };
  } catch {
    return "unavailable";
  }
}

export type VerifyResult = { ok: true; minecraftName: string } | { ok: false; error: string };

/**
 * Verifiziert das Mitglied ueber seinen Minecraft-Namen: der Name muss bei
 * Mojang existieren, die zugehoerige UUID wird gespeichert. Dieselbe UUID
 * darf nicht schon einem anderen Mitglied gehoeren - damit kann sich nicht
 * eine Person mit mehreren Discord-Accounts als derselbe Spieler ausgeben.
 */
export async function verifyMemberCore(memberId: string, rawName: string, actorId: string | null): Promise<VerifyResult> {
  const name = rawName.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    return { ok: false, error: "Ungültiger Minecraft-Name (3-16 Zeichen, nur Buchstaben, Zahlen und _)." };
  }

  const profile = await lookupMinecraftName(name);
  if (profile === "unavailable") {
    return { ok: false, error: "Mojang ist gerade nicht erreichbar - bitte gleich nochmal versuchen." };
  }
  if (!profile) {
    return { ok: false, error: `Den Minecraft-Account „${name}“ gibt es nicht.` };
  }

  const taken = await prisma.member.findFirst({
    where: { minecraftUuid: profile.uuid, id: { not: memberId } },
  });
  if (taken) {
    return { ok: false, error: "Dieser Minecraft-Account ist bereits mit einem anderen Konto verifiziert." };
  }

  await prisma.member.update({
    where: { id: memberId },
    data: {
      minecraftName: profile.name,
      minecraftUuid: profile.uuid,
      verifiedAt: new Date(),
      verifiedById: actorId,
    },
  });

  await logAction({
    actorId,
    targetId: memberId,
    action: "MEMBER_VERIFIED",
    details: `Minecraft-Account „${profile.name}“ (UUID ${profile.uuid}) verifiziert.`,
  });

  return { ok: true, minecraftName: profile.name };
}

export async function unverifyMemberCore(memberId: string, actorId: string): Promise<{ ok: boolean }> {
  await prisma.member.update({
    where: { id: memberId },
    data: { verifiedAt: null, verifiedById: null },
  });
  await logAction({
    actorId,
    targetId: memberId,
    action: "MEMBER_UNVERIFIED",
    details: "Verifizierung zurückgezogen - Mitglied muss sich erneut verifizieren.",
  });
  return { ok: true };
}

export type NameSyncResult = { checked: number; renamed: number };

/**
 * Gleicht bei allen verifizierten Mitgliedern den gespeicherten
 * Minecraft-Namen gegen die UUID ab (die sich bei einer Umbenennung NICHT
 * aendert) und zieht Namensaenderungen automatisch nach. Wird per Cron
 * aufgerufen - siehe /api/cron/loan-reminders.
 */
export async function syncMinecraftNames(): Promise<NameSyncResult> {
  const members = await prisma.member.findMany({
    where: { minecraftUuid: { not: null }, verifiedAt: { not: null } },
    select: { id: true, minecraftUuid: true, minecraftName: true, displayName: true },
  });

  let renamed = 0;
  for (const member of members) {
    if (!member.minecraftUuid) continue;
    const profile = await lookupMinecraftUuid(member.minecraftUuid);
    if (profile === "unavailable" || !profile) continue;
    if (profile.name === member.minecraftName) continue;

    await prisma.member.update({ where: { id: member.id }, data: { minecraftName: profile.name } });
    await logAction({
      targetId: member.id,
      action: "MINECRAFT_NAME_SYNCED",
      details: `Namensänderung erkannt: „${member.minecraftName}“ → „${profile.name}“ (UUID unverändert).`,
    });
    renamed += 1;
  }

  return { checked: members.length, renamed };
}
