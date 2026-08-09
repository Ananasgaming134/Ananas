import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isRevokedOrBanned = req.auth?.user?.status && req.auth.user.status !== "ACTIVE";
  const pathname = req.nextUrl.pathname;

  if ((!isLoggedIn || isRevokedOrBanned) && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const needsOnboarding = isLoggedIn && !isRevokedOrBanned && !req.auth?.user?.minecraftName;
  if (
    needsOnboarding &&
    pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/dashboard/onboarding")
  ) {
    return NextResponse.redirect(new URL("/dashboard/onboarding", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
