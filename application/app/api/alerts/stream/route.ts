import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { alertBus, type ClinicalAlertEvent } from "@/lib/alerts/alert-bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const role = (user?.role as "doctor" | "nurse" | "admin") || "doctor";
  const userId = user?.userId || "anonymous";

  const subscriberId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(eventType: string, data: unknown) {
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might have closed
        }
      }

      // 1. Send initial connection confirmation + recent alerts
      const recent = alertBus.getRecentAlerts(role);
      sendEvent("connected", {
        subscriberId,
        role,
        recentAlerts: recent,
        timestamp: new Date().toISOString(),
      });

      // 2. Subscribe to live alert bus
      unsubscribe = alertBus.subscribe(
        subscriberId,
        role,
        (alert: ClinicalAlertEvent) => {
          sendEvent("alert", alert);
        },
        userId
      );

      // 3. Heartbeat ping every 15 seconds to keep connection alive
      heartbeatInterval = setInterval(() => {
        sendEvent("ping", { time: Date.now() });
      }, 15000);
    },
    cancel() {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
