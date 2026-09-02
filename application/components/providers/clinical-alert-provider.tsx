"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { ClinicalAlertEvent, ClinicalAlertCategory, AlertSeverity } from "@/lib/alerts/alert-bus";
import { AlertCircle, BellRing, Stethoscope, Bed, Package, ShieldAlert } from "lucide-react";

interface ClinicalAlertContextType {
  alerts: ClinicalAlertEvent[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  triggerTestAlert: (params: {
    category: ClinicalAlertCategory;
    severity: AlertSeverity;
    title: string;
    message: string;
    patientId?: string;
    patientCode?: string;
    actionUrl?: string;
  }) => Promise<void>;
}

const ClinicalAlertContext = createContext<ClinicalAlertContextType>({
  alerts: [],
  unreadCount: 0,
  isConnected: false,
  markAsRead: () => {},
  markAllAsRead: () => {},
  triggerTestAlert: async () => {},
});

export const useClinicalAlerts = () => useContext(ClinicalAlertContext);

function playAlertChime(severity: AlertSeverity) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (severity === "critical") {
      // Urgent two-tone chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Gentle notification tone
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // Audio Context might be restricted before first user interaction
  }
}

export function ClinicalAlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<ClinicalAlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const displayToast = useCallback((alert: ClinicalAlertEvent) => {
    playAlertChime(alert.severity);

    const getIcon = () => {
      switch (alert.category) {
        case "clinical_vitals":
          return <Stethoscope className="size-4 text-red-600" />;
        case "emergency_bed":
          return <Bed className="size-4 text-amber-600" />;
        case "stock_low":
          return <Package className="size-4 text-[#0062a1]" />;
        case "clinical_diagnostic":
          return <ShieldAlert className="size-4 text-purple-600" />;
        default:
          return <BellRing className="size-4 text-[#0062a1]" />;
      }
    };

    const actionButton = alert.actionUrl
      ? {
          label: alert.actionLabel || "View",
          onClick: () => {
            if (alert.actionUrl) window.location.href = alert.actionUrl;
          },
        }
      : alert.patientId
      ? {
          label: "View Patient",
          onClick: () => {
            window.location.href = `/patients/${alert.patientId}`;
          },
        }
      : undefined;

    const description = (
      <div className="flex flex-col gap-1 mt-1 text-xs">
        <p className="text-slate-600 font-normal">{alert.message}</p>
        {alert.patientCode && (
          <span className="inline-block self-start font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
            MRN: {alert.patientCode}
          </span>
        )}
      </div>
    );

    if (alert.severity === "critical") {
      toast.error(alert.title, {
        icon: getIcon(),
        description,
        action: actionButton,
        duration: 8000,
      });
    } else if (alert.severity === "warning") {
      toast.warning(alert.title, {
        icon: getIcon(),
        description,
        action: actionButton,
        duration: 6000,
      });
    } else {
      toast.info(alert.title, {
        icon: getIcon(),
        description,
        action: actionButton,
        duration: 5000,
      });
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      try {
        es = new EventSource("/api/alerts/stream");
        eventSourceRef.current = es;

        es.addEventListener("connected", (e) => {
          setIsConnected(true);
          try {
            const data = JSON.parse(e.data);
            if (Array.isArray(data.recentAlerts)) {
              setAlerts(data.recentAlerts);
            }
          } catch (err) {
            console.error("Error parsing SSE connected payload:", err);
          }
        });

        es.addEventListener("alert", (e) => {
          try {
            const alert = JSON.parse(e.data) as ClinicalAlertEvent;
            setAlerts((prev) => [alert, ...prev.slice(0, 49)]);
            setUnreadCount((c) => c + 1);
            displayToast(alert);
          } catch (err) {
            console.error("Error handling SSE alert event:", err);
          }
        });

        es.onerror = () => {
          setIsConnected(false);
          es?.close();
          // Attempt graceful reconnection after 5 seconds
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (err) {
        console.error("Failed to connect to SSE Alert Bus:", err);
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (es) es.close();
    };
  }, [displayToast]);

  const markAsRead = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const triggerTestAlert = useCallback(
    async (params: {
      category: ClinicalAlertCategory;
      severity: AlertSeverity;
      title: string;
      message: string;
      patientId?: string;
      patientCode?: string;
      actionUrl?: string;
    }) => {
      await fetch("/api/alerts/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
    []
  );

  return (
    <ClinicalAlertContext.Provider
      value={{
        alerts,
        unreadCount,
        isConnected,
        markAsRead,
        markAllAsRead,
        triggerTestAlert,
      }}
    >
      {children}
    </ClinicalAlertContext.Provider>
  );
}
