import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/data/patients";
import { generateClinicalSummaryPdf } from "@/lib/pdf/clinical-summary-pdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const patient = await getPatient(id);

  if (!patient) {
    return NextResponse.json({ error: "Patient record not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get("download") === "1";

  const pdfBytes = await generateClinicalSummaryPdf(patient, {
    name: user.name || "Attending Physician",
    role: user.role === "doctor" ? "Attending Physician" : "Clinical Officer",
  });

  const filename = `Clinical-Summary-${patient.patient_code || patient.id}.pdf`;
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
