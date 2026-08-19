import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isStillAuthorized } from "@/lib/accessControl";
import { hasAtLeastRole, MEMBER_STATUS, type RoleValue } from "@/lib/constants";

export async function getSessionMember() {
  const session = await auth();
  if (!session?.user?.memberId) return null;
  return prisma.member.findUnique({ where: { id: session.user.memberId } });
}

/**
 * Stellt nur sicher, dass überhaupt eine gültige Discord-Session existiert -
 * anders als requireMember() OHNE Pflicht auf einen aktiven Member-Datensatz.
 * Wird für Seiten gebraucht, die man auch VOR einer angenommenen
 * Kunden-Bewerbung erreichen muss (z.B. /bewerbung selbst).
 */
export async function requireAuthenticated() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { discordId: session.user.id!, session };
}

/**
 * Stellt sicher, dass ein aktives Mitglied eingeloggt ist und mindestens die
 * angegebene Rolle besitzt. Leitet ansonsten auf /login bzw. /dashboard um.
 *
 * Prueft bei JEDEM Seitenaufruf zusaetzlich live gegen Discord, ob die
 * Kunden-Rolle noch besteht (kurz gecacht, siehe isStillAuthorized) - ohne
 * gueltige Rolle kommt niemand weiter, auch nicht mit einer noch gueltigen
 * Sitzung.
 */
export async function requireMember(minRole?: RoleValue) {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/login");
  if (session.user.status && session.user.status !== MEMBER_STATUS.ACTIVE) redirect("/login");
  if (minRole && !hasAtLeastRole(session.user.role, minRole)) redirect("/dashboard");

  const member = await prisma.member.findUnique({ where: { id: session.user.memberId! } });
  if (!member || member.status !== MEMBER_STATUS.ACTIVE) redirect("/login");

  if (!(await isStillAuthorized(member))) redirect("/login?grund=rolle-entzogen");

  return member;
}
