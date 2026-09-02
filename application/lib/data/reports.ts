import { createClient } from "@/lib/supabase/server";

export interface HospitalReport {
  generated_at: string;
  patients: {
    total: number;
    admitted: number;
    outpatient: number;
    discharged: number;
    new_this_month: number;
  };
  appointments: {
    total_this_month: number;
    completed: number;
    cancelled: number;
    no_shows: number;
    today_scheduled: number;
    completion_rate: string;
  };
  inventory: {
    total_items: number;
    low_stock: number;
    expiring_soon: number;
    expired: number;
  };
  staff: {
    total: number;
    doctors: number;
    nurses: number;
    admins: number;
    on_shift_today: number;
    shift_conflicts: number;
  };
  billing: {
    invoices_this_month: number;
    revenue_collected: number;
    outstanding: number;
    overdue_count: number;
  };
}

export async function getHospitalReport(): Promise<HospitalReport> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString().split("T")[0];

  const [patientRes, apptRes, invRes, staffRes, billingRes] = await Promise.all([
    supabase.from("patients").select("status, created_at"),
    supabase.from("appointments").select("status, start_time, created_at"),
    supabase.from("inventory_items").select("status, current_stock, minimum_level, expiry_date").eq("status", "active"),
    supabase.from("staff").select("id, users(role)"),
    supabase.from("invoices").select("status, total_amount, paid_at, created_at"),
  ]);

  // Patients
  const patients = patientRes.data ?? [];
  const patientData = {
    total: patients.length,
    admitted: patients.filter((p) => p.status === "admitted").length,
    outpatient: patients.filter((p) => p.status === "outpatient").length,
    discharged: patients.filter((p) => p.status === "discharged").length,
    new_this_month: patients.filter((p) => p.created_at >= monthStart).length,
  };

  // Appointments
  const appts = apptRes.data ?? [];
  const thisMonthAppts = appts.filter((a) => a.created_at >= monthStart);
  const completed = thisMonthAppts.filter((a) => a.status === "completed").length;
  const total = thisMonthAppts.length;
  const apptData = {
    total_this_month: total,
    completed,
    cancelled: thisMonthAppts.filter((a) => a.status === "cancelled").length,
    no_shows: thisMonthAppts.filter((a) => a.status === "no_show").length,
    today_scheduled: appts.filter((a) => a.start_time?.startsWith(today) && ["scheduled","confirmed"].includes(a.status)).length,
    completion_rate: total > 0 ? `${Math.round((completed / total) * 100)}%` : "—",
  };

  // Inventory
  const items = invRes.data ?? [];
  const thirtyDays = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
  const invData = {
    total_items: items.length,
    low_stock: items.filter((i) => (i.current_stock ?? 0) <= (i.minimum_level ?? 0)).length,
    expiring_soon: items.filter((i) => i.expiry_date && i.expiry_date <= thirtyDays).length,
    expired: 0,
  };

  // Staff
  const staffRows = staffRes.data ?? [];
  const role = (row: { users: unknown }) => {
    const u = Array.isArray(row.users) ? row.users[0] : row.users;
    return (u as { role?: string } | null)?.role ?? "";
  };
  const [shiftRes, conflictRes] = await Promise.all([
    supabase.from("shift_schedules").select("id").eq("shift_date", today).eq("is_published", true),
    supabase.from("shift_schedules").select("id").eq("conflict_flagged", true).gte("shift_date", today),
  ]);
  const staffData = {
    total: staffRows.length,
    doctors: staffRows.filter((s) => role(s as { users: unknown }) === "doctor").length,
    nurses: staffRows.filter((s) => role(s as { users: unknown }) === "nurse").length,
    admins: staffRows.filter((s) => role(s as { users: unknown }) === "admin").length,
    on_shift_today: (shiftRes.data ?? []).length,
    shift_conflicts: (conflictRes.data ?? []).length,
  };

  // Billing
  const bills = billingRes.data ?? [];
  const billingData = {
    invoices_this_month: bills.filter((b) => b.created_at >= monthStart).length,
    revenue_collected: bills.filter((b) => b.status === "paid" && b.paid_at && b.paid_at >= monthStart)
      .reduce((s, b) => s + Number(b.total_amount), 0),
    outstanding: bills.filter((b) => ["sent","overdue"].includes(b.status))
      .reduce((s, b) => s + Number(b.total_amount), 0),
    overdue_count: bills.filter((b) => b.status === "overdue").length,
  };

  return {
    generated_at: now.toISOString(),
    patients: patientData,
    appointments: apptData,
    inventory: invData,
    staff: staffData,
    billing: billingData,
  };
}
