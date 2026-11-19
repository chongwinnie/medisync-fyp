import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateDiagnosticReportPdf } from "@/lib/pdf/diagnostic-pdf";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const pdfBytes = await generateDiagnosticReportPdf(
      {
        patient_name: body.patient_name || "Patient",
        patient_code: body.patient_code || "PT-1044",
        report_type: body.report_type || "Imaging",
        title: body.title || "Diagnostic AI Scan Report",
        status: body.status || "FINALIZED",
        ai_assisted: body.ai_assisted ?? true,
        report_date: body.report_date || new Date().toISOString().split("T")[0],
        requested_by: body.requested_by || user.name || "Attending Physician",
        findings: body.findings || "",
        ai_summary: body.ai_summary || "",
        image_url: body.image_url || body.image_base64 || undefined,
        modality: body.modality || undefined,
        clinical_context: body.clinical_context || undefined,
      },
      {
        name: user.name || "Dr. Sarah Lin, MD",
        role: user.role === "admin" ? "Chief Medical Administrator" : "Attending Physician",
      }
    );

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get("download") === "1";
    const filename = `Diagnostic-Report-${Date.now()}.pdf`;
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
  } catch (err: any) {
    console.error("Diagnostic PDF generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate diagnostic PDF" },
      { status: 500 }
    );
  }
}
