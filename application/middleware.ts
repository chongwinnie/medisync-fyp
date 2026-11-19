import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { updateSession } from "@/lib/supabase/middleware";
import { canAccessRoute } from "@/lib/auth/role-guard";
import { resolveRoleFromDb } from "@/lib/auth/current-user";

const PUBLIC_PATHS = ["/", "/login", "/api/auth/dev-login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth")) {
    return auth0.middleware(request);
  }

  const { response, supabase } = await updateSession(request);

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return response;

  const devRole = request.cookies.get("medisync_dev_role")?.value as Role | undefined;
  if (devRole && ["doctor", "nurse", "admin"].includes(devRole)) {
    if (!canAccessRoute(devRole, pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  const session = await auth0.getSession(request);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Use the authoritative DB role for gating, not the stale JWT claim. The JWT
  // claim is set at login time and drifts when an admin changes a user's role
  // without a re-login, or when the Auth0 post-login action didn't run — which
  // caused valid nurses/admins to be bounced to /dashboard.
  const role = await resolveRoleFromDb(
    supabase,
    session.user.sub as string,
    session.user as Record<string, unknown>,
  );

  if (!canAccessRoute(role, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
