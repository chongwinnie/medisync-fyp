"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/auth/role-guard";

export function useRequireRole(
  allowedRoles: Role[],
  redirectTo = "/dashboard"
): {
  role: Role | null;
  isLoading: boolean;
  isAllowed: boolean;
} {
  const router = useRouter();
  const { role, isLoading } = useAuth();
  const isAllowed = role !== null && allowedRoles.includes(role);

  useEffect(() => {
    if (!isLoading && role !== null && !allowedRoles.includes(role)) {
      router.replace(redirectTo);
    }
  }, [allowedRoles, isLoading, redirectTo, role, router]);

  return { role, isLoading, isAllowed };
}
