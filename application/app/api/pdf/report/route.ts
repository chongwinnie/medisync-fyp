import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHospitalReport } from "@/lib/data/reports";
import { generateHospitalReportPdf } from "@/lib/pdf/report-pdf";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const report = await getHospitalReport();
  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get("download") === "1";

  const pdfBytes = await generateHospitalReportPdf(report, {
    name: user.name || "Hospital Administrator",
    role: "Chief Hospital Administrator",
  });

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `MediSync-Hospital-Report-${dateStr}.pdf`;
  const disposition = isDownload ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`;

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
