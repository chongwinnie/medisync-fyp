import { MediSyncPdfDocument, COLORS } from "./pdf-builder";

export interface DiagnosticPdfData {
  id?: string;
  patient_name: string;
  patient_code?: string;
  report_type: string;
  title: string;
  status: string;
  ai_assisted?: boolean;
  report_date: string;
  requested_by?: string;
  findings?: string;
  ai_summary?: string;
  image_url?: string | Uint8Array;
  modality?: string;
  clinical_context?: string;
}

export async function generateDiagnosticReportPdf(
  report: DiagnosticPdfData,
  auditor: { name: string; role: string } = {
    name: "Dr. Sarah Lin, MD (Chief Radiologist)",
    role: "Department of Medical Imaging & Radiology",
  }
): Promise<Uint8Array> {
  const pdf = await MediSyncPdfDocument.create();

  let imageUrl: string | Uint8Array | undefined = report.image_url;
  let findingsText = report.findings || "";

  // Extract embedded image attachment from findings if present and report.image_url is not set
  if (!imageUrl && findingsText.includes("[IMAGE_ATTACHMENT:")) {
    const match = findingsText.match(/\[IMAGE_ATTACHMENT:\s*(data:image\/[^\]]+)\]/);
    if (match) {
      imageUrl = match[1];
    }
  }

  // Always strip out the raw image attachment string from findings text before rendering text lines
  if (findingsText.includes("[IMAGE_ATTACHMENT:")) {
    findingsText = findingsText.replace(/\[IMAGE_ATTACHMENT:\s*data:image\/[^\]]+\]/g, "").trim();
  }

  // 1. Official Header
  pdf.drawHeader(
    "MEDICAL DIAGNOSTIC & IMAGING REPORT",
    `Clinical Examination & Multimodal Diagnostic Impression • ${report.report_type.toUpperCase()}`
  );

  // 2. Status Badge
  pdf.drawStatusStamp(report.status || "FINALIZED");

  // 3. Metadata Grid
  pdf.drawMetaGrid(
    {
      title: "Patient & Examination Details",
      rows: [
        ["Patient Name", report.patient_name || "Unknown Patient"],
        ["Patient MRN", report.patient_code || "PT-1044"],
        ["Report Type", report.report_type.toUpperCase()],
        ["Modality Target", report.modality || "Medical Imaging Scan"],
      ],
    },
    {
      title: "Diagnostic & Attending Info",
      rows: [
        ["Report Title", report.title],
        ["Examination Date", report.report_date],
        ["Requested By", report.requested_by || "Attending Physician"],
        ["AI Assisted", report.ai_assisted ? "YES (Multimodal Vision 2.0)" : "No"],
      ],
    }
  );

  // 4. Clinical Context (if present)
  if (report.clinical_context) {
    pdf.ensureSpace(60);
    pdf.drawText("CLINICAL PRESENTATION & INDICATIONS", {
      x: pdf.margin,
      y: pdf.currentY - 10,
      size: 9.5,
      font: pdf.fontBold,
      color: COLORS.navy,
    });
    pdf.currentY -= 22;

    const ctxBoxY = pdf.currentY - 32;
    pdf.page.drawRectangle({
      x: pdf.margin,
      y: ctxBoxY,
      width: pdf.width - pdf.margin * 2,
      height: 32,
      color: COLORS.lightGray,
      borderColor: COLORS.borderGray,
      borderWidth: 1,
    });

    pdf.drawText(report.clinical_context.slice(0, 160), {
      x: pdf.margin + 10,
      y: ctxBoxY + 12,
      size: 8,
      font: pdf.fontRegular,
      color: COLORS.darkGray,
    });
    pdf.currentY = ctxBoxY - 15;
  }

  // 5. Embedded Medical Scan Image (if provided or extracted from findings)
  if (imageUrl) {
    await pdf.embedAndDrawImage(imageUrl, {
      title: "ATTACHED DIAGNOSTIC IMAGING SCAN",
      caption: `FIGURE 1.0 - ${report.title} (${report.modality || report.report_type.toUpperCase()}) - MediSync High-Resolution Telemetry Attachment`,
      maxWidth: 480,
      maxHeight: 230,
    });
  }

  // 6. Systematic Findings & Clinical Observations
  if (findingsText) {
    pdf.ensureSpace(80);
    pdf.drawText("SYSTEMATIC RADIOLOGICAL & DIAGNOSTIC FINDINGS", {
      x: pdf.margin,
      y: pdf.currentY - 10,
      size: 9.5,
      font: pdf.fontBold,
      color: COLORS.navy,
    });
    pdf.currentY -= 22;

    const lines = findingsText.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      pdf.ensureSpace(16);

      const isHeader = line.startsWith("===");
      const isBullet = line.trim().startsWith("•") || line.trim().startsWith("✓") || line.trim().startsWith("-");

      if (isHeader) {
        pdf.drawText(line.replace(/=/g, "").trim(), {
          x: pdf.margin,
          y: pdf.currentY - 10,
          size: 8.5,
          font: pdf.fontBold,
          color: COLORS.sapphire,
        });
        pdf.currentY -= 16;
      } else {
        pdf.drawText(line.slice(0, 110), {
          x: pdf.margin + (isBullet ? 8 : 0),
          y: pdf.currentY - 10,
          size: 8,
          font: isBullet ? pdf.fontBold : pdf.fontRegular,
          color: COLORS.darkGray,
        });
        pdf.currentY -= 14;
      }
    }
    pdf.currentY -= 10;
  }

  // 7. AI Diagnostic Impression Summary
  if (report.ai_summary) {
    pdf.ensureSpace(60);
    pdf.drawText("AI MULTIMODAL SYNTHESIS & IMPRESSION", {
      x: pdf.margin,
      y: pdf.currentY - 10,
      size: 9.5,
      font: pdf.fontBold,
      color: COLORS.sapphire,
    });
    pdf.currentY -= 22;

    const summaryBoxY = pdf.currentY - 40;
    pdf.page.drawRectangle({
      x: pdf.margin,
      y: summaryBoxY,
      width: pdf.width - pdf.margin * 2,
      height: 40,
      color: COLORS.lightBlue,
      borderColor: COLORS.sapphire,
      borderWidth: 1,
    });

    pdf.drawText(report.ai_summary.slice(0, 240), {
      x: pdf.margin + 10,
      y: summaryBoxY + 14,
      size: 8,
      font: pdf.fontRegular,
      color: COLORS.navy,
    });
    pdf.currentY = summaryBoxY - 20;
  }

  // 8. Digital Security Hash & Certification
  const rawPayload = JSON.stringify({
    id: report.id || report.title,
    patient_name: report.patient_name,
    report_date: report.report_date,
    findings: findingsText,
  });

  pdf.drawDigitalSignature(auditor.name, auditor.role, rawPayload);

  return await pdf.build();
}
