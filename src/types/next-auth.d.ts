import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username?: string;
    globalName?: string;
  }

  interface Session {
    user: {
      id?: string;
      memberId?: string;
      role?: string;
      status?: string;
      minecraftName?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    memberId?: string;
    role?: string;
    status?: string;
    minecraftName?: string;
  }
}
