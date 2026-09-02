"use client";
import { useUser } from "@auth0/nextjs-auth0";
import { useServerRole } from "@/components/providers/role-provider";

export function useAuth() {
  const { user, isLoading } = useUser();
  const serverRole = useServerRole();
  const clientRole =
    user?.["https://medisync.app/role"] ?? user?.["role"] ?? null;
  // Prefer the server-provided role (fresh from the DB on every page load via
  // RoleProvider) over the JWT claim, which is set at login time and goes stale
  // when a role is changed in the DB without a re-login.
  const role = (serverRole ?? clientRole) as
    | "doctor"
    | "nurse"
    | "admin"
    | null;
  return {
    user: user
      ? { sub: user.sub as string, email: user.email, name: user.name }
      : null,
    role,
    isLoading,
    isAuthenticated: !!user,
  };
}
