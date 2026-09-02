import { NextRequest, NextResponse } from "next/server";
import { alertBus, type ClinicalAlertCategory, type AlertSeverity } from "@/lib/alerts/alert-bus";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      category = "clinical_vitals" as ClinicalAlertCategory,
      severity = "critical" as AlertSeverity,
      title,
      message,
      patientId,
      patientCode,
      patientName,
      entityType,
      entityId,
      actionUrl,
      actionLabel,
      targetRoles = ["doctor", "nurse", "admin"] as Array<"doctor" | "nurse" | "admin">,
      persist = true,
    } = body;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Missing required fields: title and message" },
        { status: 400 }
      );
    }

    // 1. Broadcast to in-memory / SSE live clients
    const alert = alertBus.broadcast({
      category,
      severity,
      title,
      message,
      patientId,
      patientCode,
      patientName,
      entityType,
      entityId,
      actionUrl,
      actionLabel,
      targetRoles,
    });

    // 2. Persist to Postgres notifications table if requested
    if (persist) {
      try {
        const supabase = await createClient();
        const notificationTypeMap: Record<ClinicalAlertCategory, string> = {
          clinical_vitals: "clinical",
          clinical_diagnostic: "clinical",
          emergency_bed: "system",
          stock_low: "inventory",
          appointment_conflict: "appointment",
          system: "system",
        };

        const notifType = notificationTypeMap[category as ClinicalAlertCategory] || "system";

        // Query users matching target roles
        const { data: users } = await supabase
          .from("users")
          .select("id, role")
          .in("role", targetRoles)
          .eq("is_active", true);

        if (users && users.length > 0) {
          const insertPayload = users.map((u) => ({
            user_id: u.id,
            type: notifType,
            title: title.slice(0, 200),
            body: message.slice(0, 2000),
            entity_type: entityType || (patientId ? "patients" : undefined),
            entity_id: entityId || patientId || undefined,
            is_read: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          await supabase.from("notifications").insert(insertPayload);
        }
      } catch (dbErr) {
        console.warn("Could not persist alert to database (non-fatal):", dbErr);
      }
    }

    return NextResponse.json({
      status: "broadcasted",
      alert,
      activeSubscribers: alertBus.getSubscriberCount(),
    });
  } catch (err) {
    console.error("Error in /api/alerts/broadcast:", err);
    return NextResponse.json(
      { error: "Failed to broadcast alert" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    activeSubscribers: alertBus.getSubscriberCount(),
    recentAlerts: alertBus.getRecentAlerts(),
  });
}
