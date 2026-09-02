import { createClient } from "@/lib/supabase/server";
import type { StaffMember } from "@/components/staff/staff-table";
import { firstRelation } from "./utils";
import type { ShiftEntry } from "@/components/staff/shift-matrix";
import type { AttendanceRecord } from "@/components/staff/attendance-table";
import type { PayrollRecord } from "@/components/staff/payroll-table";

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff")
    .select(
      `
      id,
      staff_code,
      full_name,
      department,
      specialization,
      phone,
      users (role, is_active)
    `
    )
    .order("full_name");

  if (error) {
    console.error("listStaff:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const user = firstRelation(
      row.users as
        | { role: string; is_active: boolean }
        | Array<{ role: string; is_active: boolean }>
        | null
    );
    const roleFromCode = (code: string): StaffMember["role"] | null => {
      const upper = code.toUpperCase();
      if (upper.includes("-ADM-") || upper.startsWith("STF-ADM")) return "admin";
      if (upper.includes("-DOC-") || upper.startsWith("STF-DOC")) return "doctor";
      if (upper.includes("-NUR-") || upper.startsWith("STF-NUR")) return "nurse";
      return null;
    };

    const roleFromUser =
      user?.role === "doctor" ||
      user?.role === "nurse" ||
      user?.role === "admin"
        ? user.role
        : null;

    // Prefer staff_code (STF-ADM/DOC/NUR) for directory labels. users.role can
    // diverge after QA role-flips on a shared Auth0 account or seed mismatches
    // (e.g. STF-ADM linked to a nurse user row).
    const role = roleFromCode(row.staff_code) ?? roleFromUser ?? "doctor";

    return {
      id: row.id,
      staff_code: row.staff_code,
      full_name: row.full_name,
      role,
      department: row.department ?? undefined,
      specialization: row.specialization ?? undefined,
      phone: row.phone ?? undefined,
      is_active: user?.is_active ?? true,
    };
  });
}

export async function listShiftSchedules(): Promise<ShiftEntry[]> {
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
    .order("shift_date");

  if (error) {
    console.error("listShiftSchedules:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const staffMember = firstRelation(
      row.staff as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      staff_id: row.staff_id,
      staff_name: staffMember?.full_name ?? "Unknown",
      shift_date: row.shift_date,
      shift_type: row.shift_type,
      conflict_flagged: row.conflict_flagged,
      location: row.location ?? undefined,
    };
  });
}

export async function listAttendanceRecords(): Promise<AttendanceRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `
      id,
      attendance_date,
      status,
      clock_in,
      clock_out,
      hours_worked,
      overtime_hours,
      staff (full_name)
    `
    )
    .order("attendance_date", { ascending: false });

  if (error) {
    console.error("listAttendanceRecords:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const staffMember = firstRelation(
      row.staff as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      staff_name: staffMember?.full_name ?? "Unknown",
      attendance_date: row.attendance_date,
      status: row.status,
      clock_in: row.clock_in?.slice(0, 5),
      clock_out: row.clock_out?.slice(0, 5),
      hours_worked: row.hours_worked ?? undefined,
      overtime_hours: row.overtime_hours ?? undefined,
    };
  });
}

export async function listPayrollRecords(): Promise<PayrollRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payroll_records")
    .select(
      `
      id,
      pay_month,
      pay_year,
      days_worked,
      base_salary,
      overtime_pay,
      deductions,
      net_pay,
      status,
      staff!payroll_records_staff_id_fkey (full_name)
    `
    )
    .order("pay_year", { ascending: false })
    .order("pay_month", { ascending: false });

  if (error) {
    console.error("listPayrollRecords:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const staffMember = firstRelation(
      row.staff as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      staff_name: staffMember?.full_name ?? "Unknown",
      pay_month: row.pay_month,
      pay_year: row.pay_year,
      days_worked: row.days_worked,
      base_salary: Number(row.base_salary),
      overtime_pay: Number(row.overtime_pay),
      deductions: Number(row.deductions),
      net_pay: Number(row.net_pay),
      status: row.status,
    };
  });
}

export async function getStaffSummary(
  staff: StaffMember[],
  attendance: AttendanceRecord[],
  shifts: ShiftEntry[]
) {
  const today = new Date().toISOString().split("T")[0];

  return {
    totalStaff: staff.length,
    activeStaff: staff.filter((member) => member.is_active).length,
    onLeave: attendance.filter(
      (record) =>
        record.attendance_date === today && record.status === "leave"
    ).length,
    conflictCount: shifts.filter((shift) => shift.conflict_flagged).length,
  };
}
