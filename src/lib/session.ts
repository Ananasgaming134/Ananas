import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAtLeastRole, MEMBER_STATUS, type RoleValue } from "@/lib/constants";

export async function getSessionMember() {
  const session = await auth();
  if (!session?.user?.memberId) return null;
  return prisma.member.findUnique({ where: { id: session.user.memberId } });
}

/**
 * Stellt sicher, dass ein aktives Mitglied eingeloggt ist und mindestens die
 * angegebene Rolle besitzt. Leitet ansonsten auf /login bzw. /dashboard um.
 */
export async function requireMember(minRole?: RoleValue) {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/login");
  if (session.user.status && session.user.status !== MEMBER_STATUS.ACTIVE) redirect("/login");
  if (minRole && !hasAtLeastRole(session.user.role, minRole)) redirect("/dashboard");

  const member = await prisma.member.findUnique({ where: { id: session.user.memberId! } });
  if (!member || member.status !== MEMBER_STATUS.ACTIVE) redirect("/login");
  return member;
}
