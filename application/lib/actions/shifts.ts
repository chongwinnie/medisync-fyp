"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { ShiftEntry } from "@/components/staff/shift-matrix";

export interface ShiftSuggestion {
  id: string;
  confidence: "High" | "Medium" | "Low";
  message: string;
  shiftIds: string[];
  action: "clear_conflict" | "coverage_note";
}

function weekBounds(weekOffset: number): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export async function analyzeShiftConflictsAction(
  weekOffset: number
): Promise<{ suggestions: ShiftSuggestion[]; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return { suggestions: [], error: "Admin only" };
  }

  const { start, end } = weekBounds(weekOffset);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_schedules")
    .select(
      `
      id,
      staff_id,
      shift_date,
      shift_type,
      conflict_flagged,
      location,
      staff!shift_schedules_staff_id_fkey (full_name)
    `
    )
    .gte("shift_date", start)
    .lte("shift_date", end)
    .order("shift_date");

  if (error) {
    return { suggestions: [], error: error.message };
  }

  const shifts: ShiftEntry[] = (data ?? []).map((row) => {
    const staffRel = row.staff as
      | { full_name: string }
      | { full_name: string }[]
      | null;
    const name = Array.isArray(staffRel)
      ? staffRel[0]?.full_name
      : staffRel?.full_name;
    return {
      id: row.id,
      staff_id: row.staff_id,
      staff_name: name ?? "Unknown",
      shift_date: row.shift_date,
      shift_type: row.shift_type,
      conflict_flagged: row.conflict_flagged,
      location: row.location ?? undefined,
    };
  });

  const suggestions: ShiftSuggestion[] = [];

  for (const shift of shifts.filter((s) => s.conflict_flagged)) {
    suggestions.push({
      id: `conflict-${shift.id}`,
      confidence: "High",
      message: `Flagged conflict: ${shift.staff_name} on ${shift.shift_date} (${shift.shift_type}${shift.location ? ` · ${shift.location}` : ""}). Clear the flag after reviewing coverage.`,
      shiftIds: [shift.id],
      action: "clear_conflict",
    });
  }

  const byDate = new Map<string, ShiftEntry[]>();
  for (const shift of shifts) {
    const list = byDate.get(shift.shift_date) ?? [];
    list.push(shift);
    byDate.set(shift.shift_date, list);
  }

  for (const [date, dayShifts] of byDate) {
    const doctors = dayShifts.filter((s) =>
      /dr\.|doc/i.test(s.staff_name)
    );
    if (dayShifts.length > 0 && doctors.length === 0) {
      suggestions.push({
        id: `coverage-${date}`,
        confidence: "Medium",
        message: `${date} has ${dayShifts.length} published shift(s) but no doctor-labeled coverage in the roster. Consider adding a doctor or on-call shift.`,
        shiftIds: dayShifts.map((s) => s.id),
        action: "coverage_note",
      });
    }
  }

  const byStaff = new Map<string, ShiftEntry[]>();
  for (const shift of shifts) {
    const list = byStaff.get(shift.staff_id) ?? [];
    list.push(shift);
    byStaff.set(shift.staff_id, list);
  }

  for (const staffShifts of byStaff.values()) {
    if (staffShifts.length >= 4) {
      const sample = staffShifts[0];
      suggestions.push({
        id: `load-${sample.staff_id}`,
        confidence: "Medium",
        message: `${sample.staff_name} has ${staffShifts.length} shifts this week. Review for overtime / rest-day balance.`,
        shiftIds: staffShifts.map((s) => s.id),
        action: "coverage_note",
      });
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "ok-week",
      confidence: "Low",
      message: `No conflict flags or obvious coverage gaps in ${start} – ${end}. Schedule looks stable for this week.`,
      shiftIds: [],
      action: "coverage_note",
    });
  }

  return { suggestions: suggestions.slice(0, 8) };
}

export async function applyShiftSuggestionsAction(
  suggestions: ShiftSuggestion[]
): Promise<{ success: boolean; applied: number; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return { success: false, applied: 0, error: "Admin only" };
  }

  const clearIds = [
    ...new Set(
      suggestions
        .filter((s) => s.action === "clear_conflict")
        .flatMap((s) => s.shiftIds)
    ),
  ];

  if (clearIds.length === 0) {
    return {
      success: true,
      applied: 0,
      error:
        "No conflict-clear actions to apply. Coverage notes are advisory only.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_schedules")
    .update({
      conflict_flagged: false,
      updated_at: new Date().toISOString(),
    })
    .in("id", clearIds);

  if (error) {
    return { success: false, applied: 0, error: error.message };
  }

  revalidatePath("/staff");
  return { success: true, applied: clearIds.length };
}
