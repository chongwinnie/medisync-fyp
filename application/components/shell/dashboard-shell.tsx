"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";

type Role = "doctor" | "nurse" | "admin";

interface DashboardShellProps {
  role: Role;
  userName: string;
  children: React.ReactNode;
}

/**
 * Client shell so narrow viewports can collapse the fixed sidebar (F-26).
 * Desktop sidebar is CSS-hidden below md; mobile drawer is CSS-gated (md:hidden)
 * so SSR/client markup stays aligned (F-14).
 */
export function DashboardShell({
  role,
  userName,
  children,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => {
      if (!mql.matches) setNavOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="flex min-h-dvh h-dvh flex-row overflow-hidden bg-ice-blue">
      <div className="hidden md:flex md:h-full md:min-h-0 md:shrink-0">
        <Sidebar role={role} />
      </div>

      {navOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close navigation overlay"
            onClick={() => setNavOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex h-full shadow-xl md:hidden">
            <Sidebar role={role} onNavigate={() => setNavOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          userName={userName}
          role={role}
          onMenuClick={() => setNavOpen((open) => !open)}
          menuOpen={navOpen}
        />
        <main className="min-h-0 flex-1 overflow-y-auto bg-ice-blue p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
