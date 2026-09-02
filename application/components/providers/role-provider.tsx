"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/auth/role-guard";

const RoleContext = createContext<Role | null>(null);

interface RoleProviderProps {
  role: Role;
  children: React.ReactNode;
}

export function RoleProvider({ role, children }: RoleProviderProps) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useServerRole(): Role | null {
  return useContext(RoleContext);
}
