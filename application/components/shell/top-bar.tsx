"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Bell, LogOut, Menu, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDrawer } from "./notification-drawer";
import { useClinicalAlerts } from "@/components/providers/clinical-alert-provider";

type Role = "doctor" | "nurse" | "admin";

const ROLE_STYLES: Record<
  Role,
  { label: string; bg: string; text: string }
> = {
  doctor: { label: "Doctor", bg: "#0d9488", text: "#ffffff" },
  nurse: { label: "Nurse", bg: "#db2777", text: "#ffffff" },
  admin: { label: "Admin", bg: "#7c3aed", text: "#ffffff" },
};

const UUID_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATIENT_CODE_RE = /^PT-\d+$/i;

function derivePageTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "dashboard";
  // UUID / patient-code URLs must not become the page heading (N-004).
  if (UUID_SEGMENT_RE.test(last) || PATIENT_CODE_RE.test(last)) {
    const parent = segments[segments.length - 2];
    if (parent === "patients") return "Patient Profile";
    if (parent) {
      return parent.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "Details";
  }
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface TopBarProps {
  userName?: string;
  role?: string;
  onMenuClick?: () => void;
  menuOpen?: boolean;
}

export function TopBar({
  userName,
  role,
  onMenuClick,
  menuOpen = false,
}: TopBarProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount, isConnected } = useClinicalAlerts();
  const pageTitle = derivePageTitle(pathname);
  const typedRole = role as Role | undefined;
  const roleStyle = typedRole ? ROLE_STYLES[typedRole] : null;
  const initials = userName
    ? userName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <>
      <header
        className="flex items-center justify-between gap-3 px-4 md:px-6 shrink-0 border-b border-border bg-white"
        style={{ height: "64px" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted transition-colors md:hidden"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            >
              {menuOpen ? (
                <X className="size-5 text-foreground" />
              ) : (
                <Menu className="size-5 text-foreground" />
              )}
            </button>
          )}
          <h1 className="truncate text-lg font-semibold text-foreground">
            {pageTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search…"
              className="h-9 pl-9 pr-4 text-sm rounded-lg border border-border bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring w-40 md:w-52"
            />
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors"
            aria-label="Open notifications"
            title={isConnected ? "Real-time Clinical Alerts Active" : "Connecting to Alert Bus…"}
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            {isConnected && unreadCount === 0 && (
              <span className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </button>

          {roleStyle && (
            <span
              className="hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: roleStyle.bg, color: roleStyle.text }}
            >
              {roleStyle.label}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "var(--sapphire)" }}
                title={userName}
                aria-label="Account menu"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {userName && (
                <div className="px-2 py-1.5 text-sm font-medium truncate">
                  {userName}
                </div>
              )}
              {typedRole === "admin" && (
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/auth/logout" className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <NotificationDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
