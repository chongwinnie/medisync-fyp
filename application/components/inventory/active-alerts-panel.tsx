"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  dismissInventoryAlertAction,
  reorderStockAction,
} from "@/lib/actions/inventory";

export interface Alert {
  id: string;
  type: "low_stock" | "expiry" | "reorder";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  timestamp: string;
  item_id?: string;
}

interface ActiveAlertsPanelProps {
  alerts: Alert[];
  /** When false, hide write-ish REORDER / DISMISS (nurse read-only). */
  canWrite?: boolean;
}

const SEVERITY_STYLES: Record<
  Alert["severity"],
  { border: string; badge: string; badgeText: string; dot: string }
> = {
  critical: {
    border: "border-l-4 border-l-[#E24B4A]",
    badge: "bg-red-100 text-[#E24B4A]",
    badgeText: "Critical",
    dot: "bg-[#E24B4A]",
  },
  warning: {
    border: "border-l-4 border-l-[#BA7517]",
    badge: "bg-orange-100 text-[#BA7517]",
    badgeText: "Warning",
    dot: "bg-[#BA7517]",
  },
  info: {
    border: "border-l-4 border-l-[#0062a1]",
    badge: "bg-blue-100 text-[#0062a1]",
    badgeText: "Info",
    dot: "bg-[#0062a1]",
  },
};

const ACTION_LABEL: Record<Alert["type"], string> = {
  low_stock: "REORDER NOW →",
  expiry: "ACTION",
  reorder: "REORDER NOW →",
};

export function ActiveAlertsPanel({
  alerts: initialAlerts,
  canWrite = false,
}: ActiveAlertsPanelProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const alerts = initialAlerts.filter((a) => !dismissed.has(a.id));

  async function dismiss(id: string) {
    if (!canWrite) return;
    setBusyId(id);
    const result = await dismissInventoryAlertAction(id);
    setBusyId(null);
    if (result.success) {
      setDismissed((prev) => new Set([...prev, id]));
      router.refresh();
    }
  }

  async function reorder(alert: Alert) {
    if (!canWrite || !alert.item_id) return;
    setBusyId(alert.id);
    const result = await reorderStockAction({ itemId: alert.item_id });
    setBusyId(null);
    if (result.success) {
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-black/10 overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900">
            ⚡ Active Alerts
          </span>
          {alerts.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold px-1.5 min-w-5 h-5"
              style={{ backgroundColor: "#E24B4A", color: "#fff" }}
            >
              {alerts.length}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="xs"
          style={{ borderColor: "#0062a1", color: "#0062a1" }}
        >
          AI Insights
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm">
            <span className="text-2xl mb-2">✓</span>
            No active alerts
          </div>
        )}
        {alerts.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity];
          return (
            <div
              key={alert.id}
              className={`px-4 py-3 ${styles.border} hover:bg-gray-50/50 transition-colors`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${styles.badge}`}
                  >
                    {styles.badgeText}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {alert.title}
                  </span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                  {alert.timestamp}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                {alert.message}
              </p>
              {canWrite && (
                <div className="flex items-center gap-3">
                  <button
                    className="text-xs font-semibold hover:opacity-70 transition-opacity disabled:opacity-40"
                    style={{ color: "#0062a1" }}
                    disabled={busyId === alert.id || !alert.item_id}
                    onClick={() => void reorder(alert)}
                  >
                    {ACTION_LABEL[alert.type]}
                  </button>
                  <button
                    className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                    disabled={busyId === alert.id}
                    onClick={() => void dismiss(alert.id)}
                  >
                    DISMISS
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
