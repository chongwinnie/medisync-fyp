"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { NotificationRecord } from "@/lib/data/notifications";

interface NotificationDetailSheetProps {
  notification: NotificationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDetailSheet({
  notification,
  open,
  onOpenChange,
}: NotificationDetailSheetProps) {
  if (!notification) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{notification.title}</SheetTitle>
          <SheetDescription>
            {new Date(notification.created_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {notification.body}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
