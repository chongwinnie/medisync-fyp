export type Role = "doctor" | "nurse" | "admin";

export const ROUTE_ACCESS: Record<string, Role[]> = {
  "/dashboard": ["doctor", "nurse", "admin"],
  "/appointments": ["doctor", "nurse", "admin"],
  "/patients": ["doctor", "nurse", "admin"],
  "/diagnostics": ["doctor", "nurse", "admin"],
  "/inventory": ["nurse", "admin"],
  "/staff": ["admin"],
  "/billing": ["nurse", "admin"],
  "/reports": ["admin"],
  "/chat": ["doctor", "nurse", "admin"],
  "/notifications": ["doctor", "nurse", "admin"],
  "/settings": ["admin"],
};

function normalizePath(path: string): string {
  const base = path.split("?")[0]?.split("#")[0] ?? "/dashboard";
  if (base === "/") {
    return "/dashboard";
  }
  return base.endsWith("/") && base.length > 1 ? base.slice(0, -1) : base;
}

export function canAccessRoute(role: Role | null, path: string): boolean {
  if (!role) {
    return false;
  }

  const normalizedPath = normalizePath(path);

  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ACCESS)) {
    if (
      normalizedPath === routePrefix ||
      normalizedPath.startsWith(`${routePrefix}/`)
    ) {
      return allowedRoles.includes(role);
    }
  }

  return true;
}

export function canAccessNavItem(role: Role | null, href: string): boolean {
  return canAccessRoute(role, href);
}
