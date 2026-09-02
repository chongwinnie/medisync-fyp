"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  detectAppointmentConflicts,
  getStaffIdForUser,
  listAppointmentsInRange,
} from "@/lib/data/appointments";
import type { AppointmentItem } from "@/lib/types/appointment";

export interface CreateAppointmentInput {
  patientId: string;
  staffId: string;
  visitType: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes?: string;
}

export interface UpdateAppointmentInput {
  id: string;
  visitType?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  status?: AppointmentItem["status"];
  notes?: string;
  staffId?: string;
}

async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Unauthorized");
  }
  return currentUser;
}

async function canManageStaffAppointment(
  role: string,
  userStaffId: string | null,
  targetStaffId: string
): Promise<boolean> {
  // Admin + nurse: ProjectPlan appointment ops (staff calendar / queue).
  if (role === "admin" || role === "nurse") return true;
  return userStaffId !== null && userStaffId === targetStaffId;
}

export async function fetchAppointmentsInRangeAction(
  start: string,
  end: string,
  staffId?: string | null
): Promise<AppointmentItem[]> {
  const currentUser = await requireUser();
  const isOpsView =
    currentUser.role === "admin" || currentUser.role === "nurse";
  // Ops roles may fetch all or filter by staff. Doctors only see their own.
  const effectiveStaffId = isOpsView
    ? (staffId ?? null)
    : currentUser.staffId;
  if (!isOpsView && !effectiveStaffId) return [];
  return listAppointmentsInRange(start, end, effectiveStaffId);
}

export async function callQueuePatientAction(
  queueId: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin" && currentUser.role !== "nurse") {
    return { success: false, error: "Only admin or nurse can call queue patients" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: queueRow, error: fetchError } = await supabase
    .from("appointment_queue")
    .select("id, appointment_id, status")
    .eq("id", queueId)
    .maybeSingle();

  if (fetchError || !queueRow) {
    return { success: false, error: fetchError?.message ?? "Queue entry not found" };
  }
  if (queueRow.status !== "waiting") {
    return { success: false, error: "Patient is not waiting" };
  }

  const { error: queueError } = await supabase
    .from("appointment_queue")
    .update({
      status: "called",
      called_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (queueError) {
    return { success: false, error: queueError.message };
  }

  if (queueRow.appointment_id) {
    await supabase
      .from("appointments")
      .update({ status: "in_progress", updated_at: now })
      .eq("id", queueRow.appointment_id)
      .in("status", ["scheduled", "confirmed"]);
  }

  revalidatePath("/appointments");
  return { success: true };
}

export async function checkAppointmentConflictsAction(
  staffId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  await requireUser();
  return detectAppointmentConflicts(staffId, startTime, endTime, excludeId);
}

export async function createAppointmentAction(
  input: CreateAppointmentInput
): Promise<{ success: boolean; error?: string; id?: string }> {
  const currentUser = await requireUser();
  const allowed = await canManageStaffAppointment(
    currentUser.role,
    currentUser.staffId,
    input.staffId
  );
  if (!allowed) {
    return { success: false, error: "You can only manage your own appointments" };
  }

  const hasConflict = await detectAppointmentConflicts(
    input.staffId,
    input.startTime,
    input.endTime
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: input.patientId,
      staff_id: input.staffId,
      booked_by: currentUser.staffId,
      visit_type: input.visitType,
      start_time: input.startTime,
      end_time: input.endTime,
      duration_minutes: input.durationMinutes,
      status: "scheduled",
      conflict_detected: hasConflict,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  void triggerAppointmentReminder(data.id);
  revalidatePath("/appointments");
  return { success: true, id: data.id };
}

export async function updateAppointmentAction(
  input: UpdateAppointmentInput
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("appointments")
    .select("staff_id, start_time, end_time")
    .eq("id", input.id)
    .maybeSingle();

  if (!existing) {
    return { success: false, error: "Appointment not found" };
  }

  const staffId = input.staffId ?? existing.staff_id;
  const allowed = await canManageStaffAppointment(
    currentUser.role,
    currentUser.staffId,
    staffId
  );
  if (!allowed) {
    return { success: false, error: "You can only manage your own appointments" };
  }

  const startTime = input.startTime ?? existing.start_time;
  const endTime = input.endTime ?? existing.end_time;
  const hasConflict = await detectAppointmentConflicts(
    staffId,
    startTime,
    endTime,
    input.id
  );

  const { error } = await supabase
    .from("appointments")
    .update({
      ...(input.visitType ? { visit_type: input.visitType } : {}),
      ...(input.startTime ? { start_time: input.startTime } : {}),
      ...(input.endTime ? { end_time: input.endTime } : {}),
      ...(input.durationMinutes ? { duration_minutes: input.durationMinutes } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.staffId ? { staff_id: input.staffId } : {}),
      conflict_detected: hasConflict,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    return { success: false, error: error.message };
  }

  if (input.status === "confirmed") {
    void triggerAppointmentReminder(input.id);
  }

  revalidatePath("/appointments");
  return { success: true };
}

export async function cancelAppointmentAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return updateAppointmentAction({ id, status: "cancelled" });
}

async function triggerAppointmentReminder(appointmentId: string): Promise<void> {
  const aiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? process.env.AI_API_URL;
  if (!aiUrl) return;

  try {
    await fetch(`${aiUrl}/appointments/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_id: appointmentId }),
    });
  } catch {
    // AI reminder is second-line; non-blocking
  }
}

export async function getCurrentStaffIdAction(): Promise<string | null> {
  const currentUser = await requireUser();
  if (currentUser.staffId) return currentUser.staffId;
  return getStaffIdForUser(currentUser.userId);
}
