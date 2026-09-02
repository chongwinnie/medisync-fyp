"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Stethoscope,
  MessageSquare,
  Bell,
  Package,
  CalendarCheck,
  UserCog,
  Settings,
  LogOut,
  Receipt,
  BarChart3,
} from "lucide-react";
import { NewAdmissionButton } from "./new-admission-button";

function subscribeNoop() {
  return () => {};
}

/** false on SSR / first paint, true on client — avoids F-14 nav highlight mismatch. */
function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

type Role = "doctor" | "nurse" | "admin";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["doctor", "nurse", "admin"],
  },
  {
    label: "My Schedule",
    href: "/appointments",
    icon: CalendarDays,
    roles: ["doctor"],
  },
  {
    label: "Patients",
    href: "/patients",
    icon: Users,
    roles: ["doctor", "nurse", "admin"],
  },
  {
    label: "Diagnostics",
    href: "/diagnostics",
    icon: Stethoscope,
    roles: ["doctor", "nurse", "admin"],
  },
  {
    // ProjectPlan: admin/nurse staff calendar + queue. ParallelContracts omits
    // nurse Appointments in nav matrix; exposed here to match ProjectPlan ops.
    label: "Appointments",
    href: "/appointments",
    icon: CalendarCheck,
    roles: ["admin", "nurse"],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["nurse", "admin"],
  },
  {
    label: "Staff",
    href: "/staff",
    icon: UserCog,
    roles: ["admin"],
  },
  {
    label: "Billing",
    href: "/billing",
    icon: Receipt,
    roles: ["admin", "nurse"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["admin"],
  },
  {
    label: "AI Chat",
    href: "/chat",
    icon: MessageSquare,
    roles: ["doctor", "nurse", "admin"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["doctor", "nurse", "admin"],
  },
];

interface SidebarProps {
  role: Role;
  onNavigate?: () => void;
}

export function Sidebar({ role, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const isClient = useIsClient();
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col self-stretch bg-[var(--navy)]"
      style={{ width: "240px" }}
    >
      <div className="flex items-center px-6 h-16 border-b border-white/10">
        <span className="text-white text-xl font-semibold tracking-tight">
          MediSync
        </span>
      </div>

      <div className="px-4 py-4">
        <NewAdmissionButton />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              isClient &&
              (pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href)));
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--sapphire)] text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 pb-4 border-t border-white/10 pt-4 space-y-1">
        {role === "admin" && (
          <Link
            href="/settings"
            onClick={() => onNavigate?.()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </Link>
        )}
        <Link
          href="/auth/logout"
          prefetch={false}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </Link>
      </div>
    </aside>
  );
}
