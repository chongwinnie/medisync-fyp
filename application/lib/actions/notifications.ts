"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "@/lib/data/notifications";

export async function fetchNotifications(): Promise<NotificationRecord[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return [];
  }
  return listNotifications(currentUser.userId);
}

export async function markNotificationReadAction(id: string): Promise<void> {
  await markNotificationRead(id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return;
  }
  await markAllNotificationsRead(currentUser.userId);
}
