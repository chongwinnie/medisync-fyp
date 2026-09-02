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
