import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SettingsPageClient } from "./settings-page-client";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <SettingsPageClient
      profile={{
        name: currentUser.name ?? "",
        email: currentUser.email,
        role: currentUser.role,
        department: currentUser.department ?? "",
        phone: currentUser.phone ?? "",
        specialization: currentUser.specialization ?? "",
      }}
    />
  );
}
