import { listDiagnosticReports } from "@/lib/data/diagnostics";
import { listPatientOptions } from "@/lib/data/patients";
import { DiagnosticsPageClient } from "./diagnostics-page-client";

export default async function DiagnosticsPage() {
  const [reports, patients] = await Promise.all([
    listDiagnosticReports(),
    listPatientOptions(),
  ]);
  return (
    <DiagnosticsPageClient reports={reports} patients={patients} />
  );
}
