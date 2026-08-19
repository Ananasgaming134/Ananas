import NextAuth, { type Session } from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { resolveRole } from "@/lib/discord";
import { generateCustomerNumber } from "@/lib/customerNumber";
import { MEMBER_STATUS, ROLES, type RoleValue } from "@/lib/constants";

const DEV_BYPASS = process.env.DEV_BYPASS_ROLE_CHECK === "true";
const DEV_FAKE_ROLE = ((process.env.DEV_FAKE_ROLE as RoleValue) &&
Object.values(ROLES).includes(process.env.DEV_FAKE_ROLE as RoleValue)
  ? (process.env.DEV_FAKE_ROLE as RoleValue)
  : ROLES.OWNER) as RoleValue;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization: {
        params: { scope: "identify email guilds guilds.members.read" },
      },
      profile(profile) {
        return {
          id: profile.id,
          name: profile.global_name ?? profile.username,
          email: profile.email ?? undefined,
          image: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null,
          username: profile.username,
          globalName: profile.global_name ?? profile.username,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login/fehler",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "discord" || !profile) return false;

      const discordId = String(profile.id ?? user.id ?? "");
      if (!discordId) return false;

      let resolvedRole: RoleValue | null = null;
      if (DEV_BYPASS) {
        resolvedRole = DEV_FAKE_ROLE;
      } else {
        resolvedRole = await resolveRole(discordId, account.access_token);
      }

      const existing = await prisma.member.findUnique({ where: { discordId } });

      // Gebannte Mitglieder kommen unter keinen Umständen mehr rein.
      if (existing?.status === MEMBER_STATUS.BANNED) return false;

      // Wer dauerhaft auf der roten Liste steht, kommt ebenfalls nicht rein -
      // unabhängig davon, ob je ein Member-Datensatz existiert hat. Eine bloß
      // befristete Aufnahmesperre (expiresAt gesetzt) sperrt dagegen nur die
      // Bewerbung, nicht den Login.
      const blocked = await prisma.applicationBlock.findUnique({ where: { discordId } });
      if (blocked && !blocked.expiresAt) return false;

      // Ohne aktuell gültige LeihCenter-Rolle in Discord UND ohne bereits
      // archiviertes aktives Mitglied gibt es keinen Zugriff auf den
      // eigentlichen Kundenbereich - der Login selbst wird aber trotzdem
      // erlaubt (return true, ohne Member anzulegen), damit sich jemand ohne
      // Rolle überhaupt für eine Kunden-Bewerbung einloggen kann (siehe
      // /bewerbung). requireMember() bleibt für den echten Dashboard-Bereich
      // weiterhin voll sperrend, da dort kein memberId in der Session steht.
      if (!resolvedRole) {
        if (!existing || existing.status !== MEMBER_STATUS.ACTIVE) return true;
      }

      const username = user.username ?? "unbekannt";
      const displayName = user.globalName ?? username;
      const avatarUrl = user.image ?? null;

      if (existing) {
        await prisma.member.update({
          where: { discordId },
          data: {
            username,
            displayName,
            avatarUrl,
            ...(resolvedRole
              ? { role: resolvedRole, status: MEMBER_STATUS.ACTIVE, revokedAt: null, revokedReason: null }
              : {}),
          },
        });
      } else {
        const created = await prisma.member.create({
          data: {
            discordId,
            username,
            displayName,
            avatarUrl,
            minecraftName: "",
            role: resolvedRole!,
            customerNumber: await generateCustomerNumber(),
          },
        });
        await logAction({
          actorId: created.id,
          targetId: created.id,
          action: "MEMBER_CREATED",
          details: `Automatisch archiviert bei erstem Login mit Rolle ${resolvedRole}.`,
        });
      }

      return true;
    },
    // Ohne Datenbank-Adapter vergibt Auth.js fuer token.sub / user.id eine
    // zufaellige UUID statt der von profile() zurueckgegebenen Discord-ID
    // (die "id" aus profile() ist fuer einen Adapter gedacht, den wir nicht
    // haben). Deshalb die echte Discord-ID separat als eigenes Claim
    // "discordId" sichern, sobald sie beim Login verfuegbar ist (account/
    // profile sind nur beim allerersten jwt()-Aufruf nach dem Sign-in
    // gesetzt), und ausschliesslich darueber in der DB nachschlagen.
    async jwt({ token, account, profile }) {
      if (account?.provider === "discord" && profile?.id) {
        token.discordId = String(profile.id);
      }

      if (token.discordId) {
        const member = await prisma.member.findUnique({
          where: { discordId: token.discordId as string },
        });
        if (member) {
          token.memberId = member.id;
          token.role = member.role;
          token.status = member.status;
          token.minecraftName = member.minecraftName;
        }
      }
      return token;
    },
    // Die next-auth-Beta-Typen für den "session"-Callback verschmelzen die
    // database- und jwt-Strategie-Parameter zu einer Intersection, wodurch
    // eigene Session/JWT-Erweiterungen dort nicht sauber ankommen. Deshalb
    // hier bewusst locker typisiert statt gegen die Bibliotheks-Typen zu kämpfen.
    async session({ session, token }: { session: Session; token: Record<string, unknown> }) {
      if (session.user) {
        const user = session.user as typeof session.user & Record<string, unknown>;
        user.id = (token.discordId as string | undefined) ?? (token.sub as string | undefined);
        user.memberId = token.memberId as string | undefined;
        user.role = token.role as string | undefined;
        user.status = token.status as string | undefined;
        user.minecraftName = token.minecraftName as string | undefined;
      }
      return session;
    },
  },
});
