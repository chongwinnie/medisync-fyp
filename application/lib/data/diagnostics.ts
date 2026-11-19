import { createClient } from "@/lib/supabase/server";
import type { DiagnosticReport } from "@/components/diagnostics/report-table";
import { formatDisplayDate, firstRelation } from "./utils";

export async function listDiagnosticReports(): Promise<DiagnosticReport[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnostic_reports")
    .select(
      `
      id,
      report_type,
      title,
      status,
      ai_assisted,
      report_date,
      findings,
      ai_summary,
      patients (full_name),
      requested_by:staff!diagnostic_reports_requested_by_fkey (full_name)
    `
    )
    .order("report_date", { ascending: false });

  if (error) {
    console.error("listDiagnosticReports:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const patient = firstRelation(
      row.patients as { full_name: string } | { full_name: string }[] | null
    );
    const requestedBy = firstRelation(
      row.requested_by as { full_name: string } | { full_name: string }[] | null
    );

    return {
      id: row.id,
      patient_name: patient?.full_name ?? "Unknown patient",
      report_type: row.report_type,
      title: row.title,
      status: row.status,
      ai_assisted: row.ai_assisted,
      report_date: formatDisplayDate(row.report_date),
      requested_by: requestedBy?.full_name,
      findings: (row.findings as string | null) ?? undefined,
      ai_summary: (row.ai_summary as string | null) ?? undefined,
    };
  });
}

export async function getDiagnosticReportById(id: string): Promise<DiagnosticReport | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("diagnostic_reports")
    .select(
      `
      id,
      report_type,
      title,
      status,
      ai_assisted,
      report_date,
      findings,
      ai_summary,
      patients (full_name, patient_code),
      requested_by:staff!diagnostic_reports_requested_by_fkey (full_name)
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getDiagnosticReportById:", error.message);
    return null;
  }

  const patient = firstRelation(
    data.patients as { full_name: string; patient_code: string } | { full_name: string; patient_code: string }[] | null
  );
  const requestedBy = firstRelation(
    data.requested_by as { full_name: string } | { full_name: string }[] | null
  );

  return {
    id: data.id,
    patient_name: patient?.full_name ?? "Unknown patient",
    patient_code: patient?.patient_code ?? undefined,
    report_type: data.report_type,
    title: data.title,
    status: data.status,
    ai_assisted: data.ai_assisted,
    report_date: formatDisplayDate(data.report_date),
    requested_by: requestedBy?.full_name,
    findings: (data.findings as string | null) ?? undefined,
    ai_summary: (data.ai_summary as string | null) ?? undefined,
  };
}

