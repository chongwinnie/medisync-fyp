import { redirect } from "next/navigation";
import { RoleProvider } from "@/components/providers/role-provider";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Derive the role from the DB (authoritative) via getCurrentUser, not from the
  // JWT claim. The JWT role claim is set only at login time, so it goes stale
  // when an admin changes a user's role in the DB — which made the whole shell
  // (badge, sidebar, page-view selection) keep showing "Doctor" after a role
  // change. The DB lookup is fresh on every page load.
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const role = currentUser.role;
  const userName = currentUser.name ?? currentUser.email ?? "";

  return (
    <RoleProvider role={role}>
      <DashboardShell role={role} userName={userName}>
        {children}
      </DashboardShell>
    </RoleProvider>
  );
}
