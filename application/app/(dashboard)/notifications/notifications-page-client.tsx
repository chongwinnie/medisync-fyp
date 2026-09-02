"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Calendar,
  Package,
  Users,
  Settings,
  CheckCheck,
  Check,
  Bell,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationRecord } from "@/lib/data/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";
import { getNotificationRoute } from "@/lib/notifications/navigation";
import { NotificationDetailSheet } from "@/components/notifications/notification-detail-sheet";
import { useRequireRole } from "@/hooks/use-require-role";

const TYPE_FILTERS = [
  "All",
  "Clinical",
  "Appointments",
  "Inventory",
  "Staff",
  "System",
] as const;
type FilterTab = (typeof TYPE_FILTERS)[number];

const filterToType: Record<FilterTab, NotificationRecord["type"] | null> = {
  All: null,
  Clinical: "clinical",
  Appointments: "appointment",
  Inventory: "inventory",
  Staff: "staff",
  System: "system",
};

function getTypeIcon(type: NotificationRecord["type"]) {
  const cls = "h-5 w-5";
  switch (type) {
    case "clinical":
      return <Stethoscope className={cn(cls, "text-[#0062a1]")} />;
    case "appointment":
      return <Calendar className={cn(cls, "text-[#639922]")} />;
    case "inventory":
      return <Package className={cn(cls, "text-[#BA7517]")} />;
    case "staff":
      return <Users className={cn(cls, "text-[#002444]")} />;
    case "system":
      return <Settings className={cn(cls, "text-gray-500")} />;
  }
}

function getIconBg(type: NotificationRecord["type"]) {
  switch (type) {
    case "clinical":
      return "bg-blue-50";
    case "appointment":
      return "bg-green-50";
    case "inventory":
      return "bg-amber-50";
    case "staff":
      return "bg-slate-100";
    case "system":
      return "bg-gray-100";
  }
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getDateGroup(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

  const dateMidnight = new Date(date);
  dateMidnight.setHours(0, 0, 0, 0);

  if (dateMidnight.getTime() === todayMidnight.getTime()) return "Today";
  if (dateMidnight.getTime() === yesterdayMidnight.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface NotificationsPageClientProps {
  initialNotifications: NotificationRecord[];
}

export function NotificationsPageClient({
  initialNotifications,
}: NotificationsPageClientProps) {
  const router = useRouter();
  const { isLoading, isAllowed } = useRequireRole(["doctor", "nurse", "admin"]);
  const [notifications, setNotifications] =
    useState<NotificationRecord[]>(initialNotifications);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detailNotification, setDetailNotification] =
    useState<NotificationRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read
  ).length;

  const filtered = useMemo(() => {
    const typeFilter = filterToType[activeFilter];
    return typeFilter
      ? notifications.filter((notification) => notification.type === typeFilter)
      : notifications;
  }, [notifications, activeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, NotificationRecord[]> = {};
    for (const notification of filtered) {
      const group = getDateGroup(notification.created_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(notification);
    }
    return groups;
  }, [filtered]);

  const groupOrder = useMemo(() => {
    const keys = Object.keys(grouped);
    return keys.sort((a, b) => {
      if (a === "Today") return -1;
      if (b === "Today") return 1;
      if (a === "Yesterday") return -1;
      if (b === "Yesterday") return 1;
      return new Date(b).getTime() - new Date(a).getTime();
    });
  }, [grouped]);

  if (isLoading || !isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id
          ? { ...notification, is_read: true }
          : notification
      )
    );
    await markNotificationReadAction(id);
  }

  async function markAllRead() {
    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, is_read: true }))
    );
    await markAllNotificationsReadAction();
  }

  function handleNotificationClick(notification: NotificationRecord) {
    void markRead(notification.id);
    const route = getNotificationRoute(notification);
    if (route) {
      router.push(route);
      return;
    }
    setDetailNotification(notification);
    setDetailOpen(true);
  }

  return (
    <>
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#0062a1]/10">
            <Bell className="h-5 w-5 text-[#0062a1]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#002444]">
              Notification Center
            </h1>
            {unreadCount > 0 ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                You have{" "}
                <Badge className="rounded-full px-2 py-0 text-xs font-semibold bg-[#0062a1] text-white border-0">
                  {unreadCount}
                </Badge>{" "}
                unread {unreadCount === 1 ? "message" : "messages"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">
                All caught up!
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
          className="gap-2 text-[#0062a1] border-[#0062a1] hover:bg-[#0062a1]/5"
        >
          <CheckCheck className="h-4 w-4" />
          Mark All Read
        </Button>
      </div>

      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto">
        {TYPE_FILTERS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={cn(
              "flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeFilter === tab
                ? "bg-[#0062a1] text-white"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {groupOrder.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl shadow-sm px-6">
          <Bell className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">No notifications yet</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md">
            In-app alerts appear when Celery Beat runs inventory, appointment, or
            staff scans — or when a teammate triggers an operational event. Empty
            here usually means no autonomous traffic yet, not a broken inbox.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupOrder.map((group) => (
            <div key={group}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <div className="flex flex-col gap-1">
                {grouped[group].map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "relative flex gap-4 p-4 rounded-xl cursor-pointer transition-colors",
                      "bg-white shadow-sm border border-transparent",
                      notification.is_read
                        ? "hover:bg-gray-50"
                        : "hover:bg-blue-50/40 border-l-2 border-l-[#0062a1]"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                    onMouseEnter={() => setHoveredId(notification.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div
                      className={cn(
                        "flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full mt-0.5",
                        getIconBg(notification.type)
                      )}
                    >
                      {getTypeIcon(notification.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm font-semibold leading-snug",
                            notification.is_read
                              ? "text-gray-700"
                              : "text-[#002444]"
                          )}
                        >
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatRelativeTime(notification.created_at)}
                          </span>
                          {!notification.is_read && (
                            <span className="h-2.5 w-2.5 rounded-full bg-[#0062a1] flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
                        {notification.body}
                      </p>
                    </div>

                    {!notification.is_read && hoveredId === notification.id && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void markRead(notification.id);
                        }}
                        className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-[#0062a1] hover:text-white hover:border-[#0062a1] transition-colors shadow-sm"
                      >
                        <Check className="h-3 w-3" />
                        Mark as read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <NotificationDetailSheet
      notification={detailNotification}
      open={detailOpen}
      onOpenChange={setDetailOpen}
    />
    </>
  );
}
