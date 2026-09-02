import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth0";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/role-guard";

export interface CurrentUser {
  userId: string;
  staffId: string | null;
  role: Role;
  auth0Sub: string;
  email: string;
  name: string | undefined;
  department?: string | null;
  phone?: string | null;
  specialization?: string | null;
}

/**
 * Map any DB/JWT role string to the app Role enum. Anything that isn't an
 * explicit nurse/admin (including "staff" from sync_auth0_user's default) is
 * treated as "doctor" — matching the Auth0 post-login action's mapping.
 */
function normalizeRole(role: string | null | undefined): Role {
  if (role === "nurse" || role === "admin") return role;
  return "doctor";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth0.getSession();
  if (!session?.user?.sub) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get("medisync_dev_role")?.value as Role | undefined;
    if (devRole && ["doctor", "nurse", "admin"].includes(devRole)) {
      const supabase = await createClient();
      const { data: devUser } = await supabase
        .from("users")
        .select("id, email, role, auth0_sub")
        .eq("role", devRole)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (devUser) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id, department, phone, specialization, full_name")
          .eq("user_id", devUser.id)
          .maybeSingle();

        return {
          userId: devUser.id,
          staffId: staff?.id ?? null,
          role: devRole,
          auth0Sub: devUser.auth0_sub,
          email: devUser.email,
          name: staff?.full_name || `${devRole.toUpperCase()} User`,
          department: staff?.department ?? null,
          phone: staff?.phone ?? null,
          specialization: staff?.specialization ?? null,
        };
      }
    }
    return null;
  }

  const user = session.user;
  const auth0Sub = user.sub as string;
  const email = (user.email as string) ?? "";

  const supabase = await createClient();

  // 1. Resolve an existing user row by auth0_sub.
  const { data: existingId } = await supabase.rpc("get_user_id_by_auth0_sub", {
    p_auth0_sub: auth0Sub,
  });

  let userId: string | null = (existingId as string) ?? null;

  // 2. Self-heal: if the Auth0 post-login action didn't run (or wasn't attached)
  //    the sub may not be in users yet. Upsert via sync_auth0_user so an
  //    authenticated user is always resolvable — this prevents a redirect-to-
  //    /login loop for valid sessions.
  if (!userId && email) {
    const { data: synced, error: syncErr } = await supabase.rpc(
      "sync_auth0_user",
      {
        p_auth0_sub: auth0Sub,
        p_email: email,
        p_email_verified: (user.email_verified as boolean) ?? false,
        p_last_login: new Date().toISOString(),
        p_default_role: "doctor",
      }
    );
    if (syncErr) {
      console.error("getCurrentUser: sync_auth0_user failed", syncErr.message);
    }
    userId = (synced as { id?: string } | null)?.id ?? null;
  }

  if (!userId) {
    console.error("getCurrentUser: could not resolve or sync user", auth0Sub);
    return null;
  }

  // 3. Read the authoritative role + staff link from the DB (don't rely on the
  //    JWT claim, which may be absent if the post-login action didn't run).
  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, department, phone, specialization, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  const role = normalizeRole(
    (userRow?.role as string) ??
      (user["https://medisync.app/role"] as string) ??
      (user["role"] as string)
  );

  return {
    userId,
    staffId: staff?.id ?? null,
    role,
    auth0Sub,
    email,
    name:
      (user.name as string | undefined) ||
      (staff?.full_name as string | undefined),
    department: (staff?.department as string | null) ?? null,
    phone: (staff?.phone as string | null) ?? null,
    specialization: (staff?.specialization as string | null) ?? null,
  };
}

export function extractRoleFromUser(user: Record<string, unknown>): Role {
  return normalizeRole(
    (user["https://medisync.app/role"] as string) ??
      (user["role"] as string)
  );
}

/**
 * Resolve the authoritative role from the DB (users.role by auth0_sub), falling
 * back to the JWT claim only if the DB row is missing. Used by the middleware so
 * route gating reflects the current DB role instead of the stale JWT claim set
 * at login time (which drifts when an admin changes a user's role without a
 * re-login, or when the Auth0 post-login action didn't run).
 */
export async function resolveRoleFromDb(
  supabase: SupabaseClient,
  auth0Sub: string,
  fallbackUser: Record<string, unknown>,
): Promise<Role> {
  try {
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("auth0_sub", auth0Sub)
      .maybeSingle();
    if (userRow?.role) {
      return normalizeRole(userRow.role as string);
    }
  } catch {
    // DB unavailable — fall through to JWT claim below.
  }
  return extractRoleFromUser(fallbackUser);
}
