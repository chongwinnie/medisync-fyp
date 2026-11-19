import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDiagnosticReportById } from "@/lib/data/diagnostics";
import { generateDiagnosticReportPdf } from "@/lib/pdf/diagnostic-pdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const report = await getDiagnosticReportById(id);

  if (!report) {
    return NextResponse.json({ error: "Diagnostic report not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get("download") === "1";

  const pdfBytes = await generateDiagnosticReportPdf(
    {
      id: report.id,
      patient_name: report.patient_name,
      patient_code: (report as any).patient_code || "PT-1044",
      report_type: report.report_type,
      title: report.title,
      status: report.status,
      ai_assisted: report.ai_assisted,
      report_date: report.report_date,
      requested_by: report.requested_by,
      findings: report.findings,
      ai_summary: report.ai_summary,
    },
    {
      name: user.name || "Dr. Sarah Lin, MD",
      role: user.role === "admin" ? "Chief Medical Administrator" : "Attending Physician",
    }
  );

  const filename = `Diagnostic-${report.id.slice(0, 8)}.pdf`;
  const disposition = isDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Content-Length": String(pdfBytes.byteLength),
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
