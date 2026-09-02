"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import type { NotificationRecord } from "@/lib/data/notifications";
import {
  fetchNotifications,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";
import { getNotificationRoute } from "@/lib/notifications/navigation";
import { NotificationDetailSheet } from "@/components/notifications/notification-detail-sheet";
import { useClinicalAlerts } from "@/components/providers/clinical-alert-provider";

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDrawer({
  open,
  onOpenChange,
}: NotificationDrawerProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [detailNotification, setDetailNotification] =
    useState<NotificationRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadNotifications() {
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      void loadNotifications();
    }
    onOpenChange(nextOpen);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await markNotificationReadAction(id);
  }

  const { markAllAsRead: clearLiveUnread } = useClinicalAlerts();

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    clearLiveUnread();
    await markAllNotificationsReadAction();
  }

  function handleClick(notification: NotificationRecord) {
    void markRead(notification.id);
    const route = getNotificationRoute(notification);
    if (route) {
      handleOpenChange(false);
      router.push(route);
      return;
    }
    setDetailNotification(notification);
    setDetailOpen(true);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-80 sm:w-96">
          <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
              {unreadCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({unreadCount} unread)
                </span>
              )}
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              Mark all read
            </Button>
          </SheetHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center mt-8">
              Loading...
            </p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 mt-8 px-4 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/80">
                Autonomous Beat tasks (stock, conflicts, shifts) write here when they run.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
              {notifications.slice(0, 20).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleClick(notification)}
                  className={`w-full text-left rounded-lg p-3 transition-colors hover:bg-muted/60 ${
                    notification.is_read ? "opacity-70" : "bg-blue-50/50"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {notification.body}
                  </p>
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NotificationDetailSheet
        notification={detailNotification}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
