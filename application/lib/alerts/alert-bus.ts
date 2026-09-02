import { EventEmitter } from "events";

export type ClinicalAlertCategory =
  | "clinical_vitals"
  | "clinical_diagnostic"
  | "emergency_bed"
  | "stock_low"
  | "appointment_conflict"
  | "system";

export type AlertSeverity = "critical" | "warning" | "info";

export interface ClinicalAlertEvent {
  id: string;
  category: ClinicalAlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string;
  patientId?: string;
  patientCode?: string;
  patientName?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  actionLabel?: string;
  targetRoles: Array<"doctor" | "nurse" | "admin">;
}

export type AlertSubscriberCallback = (event: ClinicalAlertEvent) => void;

interface Subscriber {
  id: string;
  userId?: string;
  role: "doctor" | "nurse" | "admin";
  callback: AlertSubscriberCallback;
}

class ClinicalAlertBus extends EventEmitter {
  private subscribers: Map<string, Subscriber> = new Map();
  private recentHistory: ClinicalAlertEvent[] = [];
  private maxHistory: number = 30;

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Subscribe an active SSE connection to receive role-filtered alerts
   */
  subscribe(
    id: string,
    role: "doctor" | "nurse" | "admin",
    callback: AlertSubscriberCallback,
    userId?: string
  ): () => void {
    const subscriber: Subscriber = { id, role, callback, userId };
    this.subscribers.set(id, subscriber);

    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Broadcast an alert to all active subscribers matching the target roles
   */
  broadcast(alert: Omit<ClinicalAlertEvent, "id" | "timestamp"> & { id?: string; timestamp?: string }): ClinicalAlertEvent {
    const fullAlert: ClinicalAlertEvent = {
      ...alert,
      id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: alert.timestamp || new Date().toISOString(),
    };

    // Store in circular buffer
    this.recentHistory.unshift(fullAlert);
    if (this.recentHistory.length > this.maxHistory) {
      this.recentHistory.pop();
    }

    // Dispatch to matching role subscribers
    for (const sub of this.subscribers.values()) {
      if (
        fullAlert.targetRoles.length === 0 ||
        fullAlert.targetRoles.includes(sub.role) ||
        sub.role === "admin"
      ) {
        try {
          sub.callback(fullAlert);
        } catch (err) {
          console.error(`Error dispatching alert to subscriber ${sub.id}:`, err);
        }
      }
    }

    return fullAlert;
  }

  /**
   * Get active subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Get recent alert history for initial sync
   */
  getRecentAlerts(role?: "doctor" | "nurse" | "admin"): ClinicalAlertEvent[] {
    if (!role || role === "admin") return [...this.recentHistory];
    return this.recentHistory.filter(
      (a) => a.targetRoles.length === 0 || a.targetRoles.includes(role)
    );
  }
}

// Global Singleton (preserves instance across Next.js module reloads in dev)
const globalForAlertBus = globalThis as unknown as {
  clinicalAlertBus?: ClinicalAlertBus;
};

export const alertBus =
  globalForAlertBus.clinicalAlertBus ?? new ClinicalAlertBus();

if (process.env.NODE_ENV !== "production") {
  globalForAlertBus.clinicalAlertBus = alertBus;
}
