import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listNotifications } from "@/lib/data/notifications";
import { NotificationsPageClient } from "./notifications-page-client";

export default async function NotificationsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const notifications = await listNotifications(currentUser.userId);
  return <NotificationsPageClient initialNotifications={notifications} />;
}
