import { MediSyncPdfDocument } from "./pdf-builder";
import type { PatientDetailData } from "@/lib/data/patients";

export async function generateClinicalSummaryPdf(
  patient: PatientDetailData,
  physician: { name: string; role: string } = { name: patient.primary_doctor || "Attending Physician", role: "Consultant Specialist" }
): Promise<Uint8Array> {
  const pdf = await MediSyncPdfDocument.create();

  // 1. Header
  pdf.drawHeader("PATIENT CLINICAL SUMMARY & DISCHARGE REPORT", "Confidential Medical Health Record • Department of Clinical Medicine");

  // 2. Status Stamp
  pdf.drawStatusStamp(patient.status.toUpperCase());

  // 3. Metadata Grid
  const age = patient.date_of_birth
    ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()} yrs`
    : "—";

  pdf.drawMetaGrid(
    {
      title: "Patient Demographics",
      rows: [
        ["Full Name", patient.full_name || "Unknown"],
        ["MRN / Code", patient.patient_code || "N/A"],
        ["Age / Gender", `${age} / ${(patient.gender || "U").toUpperCase()}`],
        ["Blood Type", patient.blood_type || "N/A"],
        ["Allergies", Array.isArray(patient.allergies) ? patient.allergies.join(", ") : "None Recorded"],
      ],
    },
    {
      title: "Care & Clinical Overview",
      rows: [
        ["Clinical Status", patient.status.toUpperCase()],
        ["Primary Doctor", patient.primary_doctor || "Unassigned"],
        ["Ward / Bed", patient.ward || "Outpatient Care"],
        ["Admission Date", patient.admitted_at ? new Date(patient.admitted_at).toLocaleDateString("en-GB") : "Ambulatory"],
        ["Record Date", new Date().toLocaleDateString("en-GB")],
      ],
    }
  );

  // 4. Clinical Vitals Section
  if (patient.vitals && patient.vitals.length > 0) {
    const vitalCols = [
      { header: "Clinical Vital Sign", width: 220, align: "left" as const },
      { header: "Measurement", width: 140, align: "center" as const },
      { header: "Assessment", width: 155, align: "right" as const },
    ];

    const vitalRows = patient.vitals.map((v) => ({
      values: [
        v.label,
        `${v.value} ${v.unit}`,
        v.flag === "normal" ? "Normal Range" : `Flagged ${v.flag.toUpperCase()}`,
      ],
      bold: v.flag !== "normal",
    }));

    pdf.drawTable(vitalCols, vitalRows);
  }

  // 5. Diagnosed Conditions & Medications Table
  const condList = (patient.conditions || []).map((c) => c.condition_name).join("; ") || "None Active";
  const medList = (patient.medications || []).map((m) => `${m.drug_name} (${m.dosage}, ${m.frequency})`).join("; ") || "None Prescribed";

  const clinicalCols = [
    { header: "Clinical Domain", width: 160, align: "left" as const },
    { header: "Clinical Findings & Prescriptions", width: 355, align: "left" as const },
  ];

  const clinicalRows = [
    { values: ["Active Medical Diagnoses", condList], bold: true },
    { values: ["Current Medications & Dosage", medList] },
  ];

  pdf.drawTable(clinicalCols, clinicalRows);

  // 6. Treatment Plan & Objectives
  if (patient.treatmentPlan) {
    pdf.ensureSpace(50);
    pdf.page.drawText("PRIMARY TREATMENT PLAN & OBJECTIVES:", {
      x: pdf.margin,
      y: pdf.currentY,
      size: 8.5,
      font: pdf.fontBold,
    });
    pdf.page.drawText(
      patient.treatmentPlan.objectives || patient.treatmentPlan.title || "Active clinical care pathway.",
      {
        x: pdf.margin,
        y: pdf.currentY - 14,
        size: 8,
        font: pdf.fontRegular,
      }
    );
    pdf.currentY -= 35;
  }

  // 7. Digital Signature & Certification Seal
  const clinicalPayload = JSON.stringify({
    patient_id: patient.id,
    patient_code: patient.patient_code,
    full_name: patient.full_name,
    conditions: patient.conditions,
    status: patient.status,
    timestamp: new Date().toISOString(),
  });

  pdf.drawDigitalSignature(physician.name, physician.role, clinicalPayload);

  return await pdf.build();
}
