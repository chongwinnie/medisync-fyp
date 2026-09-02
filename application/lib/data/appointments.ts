import { createClient } from "@/lib/supabase/server";
import type { AppointmentItem } from "@/lib/types/appointment";
import type { QueueItem } from "@/components/appointments/queue-board";
import { formatDisplayTime, formatVisitType, firstRelation } from "./utils";

export interface AppointmentConflict {
  id: string;
  staff_name: string;
  time_range: string;
  patients: string[];
  room?: string;
}

function mapAppointmentRow(row: Record<string, unknown>): AppointmentItem {
  const patient = firstRelation(
    row.patients as { full_name: string; id?: string } | Array<{ full_name: string; id?: string }> | null
  );
  const staffMember = firstRelation(
    row.staff as { full_name: string; id?: string } | Array<{ full_name: string; id?: string }> | null
  );
  const room = firstRelation(
    row.rooms as { room_number: string } | Array<{ room_number: string }> | null
  );

  return {
    id: row.id as string,
    patient_id: patient?.id,
    staff_id: (row.staff_id as string) ?? staffMember?.id,
    patient_name: patient?.full_name ?? "Unknown patient",
    staff_name: staffMember?.full_name ?? "Unassigned",
    start_time: row.start_time as string,
    end_time: row.end_time as string,
    visit_type: formatVisitType(row.visit_type as string),
    status: row.status as AppointmentItem["status"],
    room: room?.room_number ? `Room ${room.room_number}` : undefined,
    conflict_detected: (row.conflict_detected as boolean) ?? false,
    notes: (row.notes as string) ?? undefined,
  };
}

const APPOINTMENT_SELECT = `
  id,
  patient_id,
  staff_id,
  start_time,
  end_time,
  visit_type,
  status,
  conflict_detected,
  notes,
  patients (id, full_name),
  staff:staff_id (id, full_name),
  rooms (room_number)
`;

export async function getStaffIdForUser(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function listAppointmentsInRange(
  start: string,
  end: string,
  staffId?: string | null
): Promise<AppointmentItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .gte("start_time", start)
    .lte("start_time", end)
    .neq("status", "cancelled")
    .order("start_time");

  if (staffId) {
    query = query.eq("staff_id", staffId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("listAppointmentsInRange:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapAppointmentRow(row as Record<string, unknown>));
}

export async function listAppointments(
  staffId?: string | null
): Promise<AppointmentItem[]> {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 2);
  return listAppointmentsInRange(start.toISOString(), end.toISOString(), staffId);
}

export async function detectAppointmentConflicts(
  staffId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  const supabase = await createClient();

  let query = supabase
    .from("appointments")
    .select("id, start_time, end_time")
    .eq("staff_id", staffId)
    .neq("status", "cancelled")
    .lt("start_time", endTime)
    .gt("end_time", startTime);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("detectAppointmentConflicts:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function listQueue(): Promise<QueueItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointment_queue")
    .select(
      `
      id,
      queue_number,
      status,
      checked_in_at,
      appointments (
        patients (full_name)
      )
    `
    )
    .order("queue_number");

  if (error) {
    console.error("listQueue:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const appointment = firstRelation(
      row.appointments as
        | { patients: { full_name: string } | { full_name: string }[] | null }
        | Array<{ patients: { full_name: string } | { full_name: string }[] | null }>
        | null
    );
    const patient = firstRelation(
      appointment?.patients as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      queue_number: row.queue_number,
      patient_name: patient?.full_name ?? "Unknown patient",
      status: row.status,
      checked_in_at: row.checked_in_at
        ? formatDisplayTime(row.checked_in_at)
        : undefined,
    };
  });
}

export async function listAppointmentConflicts(): Promise<AppointmentConflict[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      start_time,
      end_time,
      staff:staff_id (full_name),
      patients (full_name),
      rooms (room_number)
    `
    )
    .eq("conflict_detected", true)
    .order("start_time");

  if (error) {
    console.error("listAppointmentConflicts:", error.message);
    return [];
  }

  const grouped = new Map<string, AppointmentConflict>();

  for (const row of data ?? []) {
    const staffMember = firstRelation(
      row.staff as { full_name: string } | { full_name: string }[] | null
    );
    const patient = firstRelation(
      row.patients as { full_name: string } | { full_name: string }[] | null
    );
    const room = firstRelation(
      row.rooms as { room_number: string } | { room_number: string }[] | null
    );
    const staffName = staffMember?.full_name ?? "Unknown staff";
    const key = `${staffName}-${row.start_time.slice(0, 10)}`;

    const existing = grouped.get(key);
    const timeRange = `${new Date(row.start_time).toLocaleDateString("en-GB")} ${formatDisplayTime(row.start_time)} – ${formatDisplayTime(row.end_time)}`;

    if (existing) {
      if (patient?.full_name) existing.patients.push(patient.full_name);
    } else {
      grouped.set(key, {
        id: row.id,
        staff_name: staffName,
        time_range: timeRange,
        patients: patient?.full_name ? [patient.full_name] : [],
        room: room?.room_number ? `Room ${room.room_number}` : undefined,
      });
    }
  }

  return Array.from(grouped.values());
}
