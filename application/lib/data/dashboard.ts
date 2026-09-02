import { createClient } from "@/lib/supabase/server";
import type { ScheduleItem } from "@/components/dashboard/schedule-table";
import type { ActivityItem } from "@/components/dashboard/recent-activity-feed";
import {
  formatDisplayTime,
  formatRelativeTime,
  formatVisitType,
  firstRelation,
  getTodayBounds,
} from "./utils";
import {
  Users,
  FileText,
  CalendarClock,
  ClipboardList,
  Package,
  BedDouble,
  UserCog,
  AlertTriangle,
} from "lucide-react";
import type { Role } from "@/lib/auth/role-guard";

export interface DashboardKpi {
  title: string;
  value: string | number;
  change?: string;
  icon: typeof Users;
  color: string;
}

export async function getDashboardKpis(
  role: Role = "doctor"
): Promise<DashboardKpi[]> {
  const supabase = await createClient();
  const { start, end } = getTodayBounds();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  if (role === "admin") {
    const [staffResult, lowStockResult, conflictsResult, alertsResult] =
      await Promise.all([
        supabase
          .from("staff")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("inventory_items")
          .select("id, current_stock, minimum_level"),
        supabase
          .from("shift_schedules")
          .select("id", { count: "exact", head: true })
          .eq("conflict_flagged", true),
        supabase
          .from("inventory_alerts")
          .select("id", { count: "exact", head: true })
          .eq("is_dismissed", false),
      ]);

    const lowStock = (lowStockResult.data ?? []).filter(
      (item) => item.current_stock <= item.minimum_level
    ).length;

    return [
      {
        title: "Active Staff",
        value: staffResult.count ?? 0,
        change: "Directory",
        icon: UserCog,
        color: "#0062a1",
      },
      {
        title: "Low Stock Items",
        value: lowStock,
        change: lowStock > 0 ? "Needs attention" : "Healthy",
        icon: Package,
        color: "#BA7517",
      },
      {
        title: "Shift Conflicts",
        value: conflictsResult.count ?? 0,
        change: (conflictsResult.count ?? 0) > 0 ? "Review" : "Clear",
        icon: AlertTriangle,
        color: "#E24B4A",
      },
      {
        title: "Inventory Alerts",
        value: alertsResult.count ?? 0,
        change: "Open",
        icon: ClipboardList,
        color: "#002444",
      },
    ];
  }

  if (role === "nurse") {
    const [appointmentsTodayResult, admittedResult, lowStockResult, roomsResult] =
      await Promise.all([
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("start_time", start)
          .lte("start_time", end),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("status", "admitted"),
        supabase
          .from("inventory_alerts")
          .select("id", { count: "exact", head: true })
          .eq("is_dismissed", false),
        supabase.from("rooms").select("id, bed_count, status"),
      ]);

    const availableBeds = (roomsResult.data ?? []).reduce((sum, room) => {
      if (room.status === "available" || room.status === "occupied") {
        return sum + (room.bed_count as number);
      }
      return sum;
    }, 0);

    return [
      {
        title: "Patients Today",
        value: appointmentsTodayResult.count ?? 0,
        change: "Schedule",
        icon: Users,
        color: "#0062a1",
      },
      {
        title: "Admitted Patients",
        value: admittedResult.count ?? 0,
        change: "On ward",
        icon: BedDouble,
        color: "#002444",
      },
      {
        title: "Inventory Alerts",
        value: lowStockResult.count ?? 0,
        change: (lowStockResult.count ?? 0) > 0 ? "Check stock" : "Clear",
        icon: Package,
        color: "#BA7517",
      },
      {
        title: "Beds in Rooms",
        value: availableBeds,
        change: "Capacity",
        icon: BedDouble,
        color: "#639922",
      },
    ];
  }

  // Doctor clinical KPI set (default)
  const [
    appointmentsTodayResult,
    pendingReportsResult,
    nextAppointmentResult,
    draftPlansResult,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("start_time", start)
      .lte("start_time", end),
    supabase
      .from("diagnostic_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("appointments")
      .select("start_time, visit_type, rooms(room_number)")
      .gte("start_time", new Date().toISOString())
      .lte("start_time", end)
      .in("status", ["scheduled", "confirmed", "in_progress"])
      .order("start_time")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("treatment_plans")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .gte("created_at", weekStart.toISOString()),
  ]);

  const nextAppointment = nextAppointmentResult.data;
  const room = firstRelation(
    nextAppointment?.rooms as
      | { room_number: string }
      | { room_number: string }[]
      | null
      | undefined
  );

  return [
    {
      title: "Patients Today",
      value: appointmentsTodayResult.count ?? 0,
      change: "On Track",
      icon: Users,
      color: "#0062a1",
    },
    {
      title: "Pending Reports",
      value: pendingReportsResult.count ?? 0,
      change: (pendingReportsResult.count ?? 0) > 0 ? "Urgent" : undefined,
      icon: FileText,
      color: "#BA7517",
    },
    {
      title: "Next Appointment",
      value: nextAppointment
        ? formatDisplayTime(nextAppointment.start_time)
        : "—",
      change: nextAppointment
        ? `${room?.room_number ? `Room ${room.room_number}` : "No room"} • ${formatVisitType(nextAppointment.visit_type)}`
        : "No upcoming today",
      icon: CalendarClock,
      color: "#639922",
    },
    {
      title: "Treatment Plans Drafted",
      value: draftPlansResult.count ?? 0,
      change: "This week",
      icon: ClipboardList,
      color: "#002444",
    },
  ];
}

export async function getTodaySchedule(): Promise<ScheduleItem[]> {
  const supabase = await createClient();
  const { start, end } = getTodayBounds();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      start_time,
      visit_type,
      status,
      patients (full_name),
      rooms (room_number)
    `
    )
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time");

  if (error) {
    console.error("getTodaySchedule:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const patient = firstRelation(
      row.patients as { full_name: string } | { full_name: string }[] | null
    );
    const room = firstRelation(
      row.rooms as { room_number: string } | { room_number: string }[] | null
    );
    const rawStatus = row.status as string;
    const mappedStatus =
      rawStatus === "confirmed" || rawStatus === "no_show"
        ? "scheduled"
        : rawStatus;

    return {
      time: formatDisplayTime(row.start_time),
      patient: patient?.full_name ?? "Unknown patient",
      type: formatVisitType(row.visit_type),
      room: room?.room_number ? `Rm ${room.room_number}` : undefined,
      status: mappedStatus as ScheduleItem["status"],
    };
  });
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const { data: caseHistory, error: caseError } = await supabase
    .from("case_history")
    .select("id, visit_type, chief_complaint, visit_date, patients(full_name)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!caseError && caseHistory && caseHistory.length > 0) {
    return caseHistory.map((row) => {
      const patient = firstRelation(
        row.patients as { full_name: string } | { full_name: string }[] | null
      );
      return {
        id: row.id,
        message: `${formatVisitType(row.visit_type)}${patient ? ` for ${patient.full_name}` : ""}${row.chief_complaint ? `: ${row.chief_complaint}` : ""}`,
        timestamp: formatRelativeTime(row.visit_date),
        type: "clinical" as const,
      };
    });
  }

  const { data: auditLogs, error: auditError } = await supabase
    .from("audit_logs")
    .select("id, action, table_name, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (auditError) {
    console.error("getRecentActivity:", auditError.message);
    return [];
  }

  return (auditLogs ?? []).map((row) => ({
    id: row.id,
    message: `${row.action} on ${row.table_name}`,
    timestamp: formatRelativeTime(row.created_at),
    type: "system" as const,
  }));
}
