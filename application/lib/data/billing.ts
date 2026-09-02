import { createClient } from "@/lib/supabase/server";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  appointment_id: string | null;
  line_items: LineItem[];
  subtotal: number;
  tax: number;
  total_amount: number;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface BillingSummary {
  outstanding_count: number;
  outstanding_amount: number;
  overdue_count: number;
  paid_this_month: number;
  revenue_this_month: number;
  draft_count: number;
}

export async function getInvoices(filters?: {
  status?: InvoiceStatus;
  patient_id?: string;
}): Promise<Invoice[]> {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(
      `
      id, invoice_number, patient_id, appointment_id,
      line_items, subtotal, tax, total_amount, status,
      due_date, paid_at, notes, created_at,
      patients (full_name, patient_code)
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.patient_id) query = query.eq("patient_id", filters.patient_id);

  const { data, error } = await query;
  if (error) {
    console.error("getInvoices:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const patient = Array.isArray(row.patients)
      ? row.patients[0]
      : row.patients;
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      patient_id: row.patient_id,
      patient_name: (patient as { full_name: string } | null)?.full_name ?? "Unknown",
      patient_code: (patient as { patient_code: string } | null)?.patient_code ?? "",
      appointment_id: row.appointment_id,
      line_items: (row.line_items as LineItem[]) ?? [],
      subtotal: Number(row.subtotal),
      tax: Number(row.tax),
      total_amount: Number(row.total_amount),
      status: row.status as InvoiceStatus,
      due_date: row.due_date,
      paid_at: row.paid_at,
      notes: row.notes,
      created_at: row.created_at,
    };
  });
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id, invoice_number, patient_id, appointment_id,
      line_items, subtotal, tax, total_amount, status,
      due_date, paid_at, notes, created_at,
      patients (full_name, patient_code)
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getInvoiceById:", error.message);
    return null;
  }

  const patient = Array.isArray(data.patients) ? data.patients[0] : data.patients;
  return {
    id: data.id,
    invoice_number: data.invoice_number,
    patient_id: data.patient_id,
    patient_name: (patient as { full_name: string } | null)?.full_name ?? "Unknown",
    patient_code: (patient as { patient_code: string } | null)?.patient_code ?? "",
    appointment_id: data.appointment_id,
    line_items: (data.line_items as LineItem[]) ?? [],
    subtotal: Number(data.subtotal),
    tax: Number(data.tax),
    total_amount: Number(data.total_amount),
    status: data.status as InvoiceStatus,
    due_date: data.due_date,
    paid_at: data.paid_at,
    notes: data.notes,
    created_at: data.created_at,
  };
}

export async function getBillingSummary(): Promise<BillingSummary> {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase.from("invoices").select("status, total_amount, paid_at, due_date");
  if (error) {
    console.error("getBillingSummary:", error.message);
    return { outstanding_count: 0, outstanding_amount: 0, overdue_count: 0, paid_this_month: 0, revenue_this_month: 0, draft_count: 0 };
  }

  const rows = data ?? [];
  return {
    outstanding_count: rows.filter((r) => r.status === "sent" || r.status === "overdue").length,
    outstanding_amount: rows
      .filter((r) => r.status === "sent" || r.status === "overdue")
      .reduce((s, r) => s + Number(r.total_amount), 0),
    overdue_count: rows.filter((r) => r.status === "overdue").length,
    paid_this_month: rows.filter((r) => r.status === "paid" && r.paid_at && r.paid_at >= monthStart).length,
    revenue_this_month: rows
      .filter((r) => r.status === "paid" && r.paid_at && r.paid_at >= monthStart)
      .reduce((s, r) => s + Number(r.total_amount), 0),
    draft_count: rows.filter((r) => r.status === "draft").length,
  };
}
