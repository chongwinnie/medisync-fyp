import type { NotificationRecord } from "@/lib/data/notifications";

export function getNotificationRoute(notification: NotificationRecord): string | null {
  if (!notification.entity_type || !notification.entity_id) {
    return null;
  }

  switch (notification.entity_type) {
    case "patient":
      return `/patients/${notification.entity_id}`;
    case "appointment":
      return `/appointments?highlight=${notification.entity_id}`;
    case "diagnostic_report":
      return `/diagnostics?report=${notification.entity_id}`;
    case "inventory":
      return `/inventory?highlight=${notification.entity_id}`;
    case "staff":
      return `/staff?highlight=${notification.entity_id}`;
    default:
      return null;
  }
}

export function shouldOpenDetailSheet(notification: NotificationRecord): boolean {
  return getNotificationRoute(notification) === null;
}
