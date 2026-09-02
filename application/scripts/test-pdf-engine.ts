import { generateInvoicePdf } from "../lib/pdf/invoice-pdf";
import { generateHospitalReportPdf } from "../lib/pdf/report-pdf";
import { generateClinicalSummaryPdf } from "../lib/pdf/clinical-summary-pdf";
import type { Invoice } from "../lib/data/billing";
import type { HospitalReport } from "../lib/data/reports";
import type { PatientDetailData } from "../lib/data/patients";

async function runTests() {
  console.log("=== Testing MediSync Headless PDF Engine ===");

  // 1. Invoice PDF Test
  const mockInvoice: Invoice = {
    id: "inv-test-12345",
    invoice_number: "INV-202608-0042",
    patient_id: "pat-123",
    patient_name: "Sarah Jenkins",
    patient_code: "PT-1042",
    appointment_id: null,
    line_items: [
      { description: "Specialist Cardiac Consultation", quantity: 1, unit_price: 150.0 },
      { description: "Echocardiogram (Transthoracic)", quantity: 1, unit_price: 320.0 },
      { description: "Lipid & Cardiac Biomarker Panel", quantity: 1, unit_price: 85.0 },
    ],
    subtotal: 555.0,
    tax: 55.5,
    total_amount: 610.5,
    status: "paid",
    due_date: "2026-09-15",
    paid_at: "2026-08-26T14:30:00Z",
    notes: "Settled via Corporate Health Insurance Guarantee Letter.",
    created_at: "2026-08-26T10:00:00Z",
  };

  const invoicePdfBytes = await generateInvoicePdf(mockInvoice, {
    name: "Dr. Alicia Vance",
    role: "Chief Hospital Administrator",
  });

  const invoiceHeader = Buffer.from(invoicePdfBytes.slice(0, 5)).toString("utf-8");
  console.log(`[PASS] Invoice PDF generated: ${invoicePdfBytes.byteLength} bytes (Magic: ${invoiceHeader})`);
  if (!invoiceHeader.startsWith("%PDF")) {
    throw new Error("Invalid PDF magic bytes for invoice");
  }

  // 2. Hospital Report PDF Test
  const mockReport: HospitalReport = {
    generated_at: new Date().toISOString(),
    patients: {
      total: 142,
      admitted: 38,
      outpatient: 89,
      discharged: 15,
      new_this_month: 24,
    },
    appointments: {
      total_this_month: 210,
      completed: 188,
      cancelled: 12,
      no_shows: 10,
      today_scheduled: 18,
      completion_rate: "90%",
    },
    inventory: {
      total_items: 64,
      low_stock: 3,
      expiring_soon: 2,
      expired: 0,
    },
    staff: {
      total: 32,
      doctors: 12,
      nurses: 15,
      admins: 5,
      on_shift_today: 18,
      shift_conflicts: 0,
    },
    billing: {
      invoices_this_month: 114,
      revenue_collected: 48520.0,
      outstanding: 6200.0,
      overdue_count: 2,
    },
  };

  const reportPdfBytes = await generateHospitalReportPdf(mockReport, {
    name: "Dr. Marcus Reed",
    role: "Medical Director & Head of Operations",
  });

  const reportHeader = Buffer.from(reportPdfBytes.slice(0, 5)).toString("utf-8");
  console.log(`[PASS] Hospital Report PDF generated: ${reportPdfBytes.byteLength} bytes (Magic: ${reportHeader})`);
  if (!reportHeader.startsWith("%PDF")) {
    throw new Error("Invalid PDF magic bytes for report");
  }

  // 3. Clinical Summary PDF Test
  const mockPatient: PatientDetailData = {
    id: "pat-999",
    patient_code: "PT-9021",
    full_name: "Robert Chen",
    date_of_birth: "1978-04-12",
    gender: "male",
    status: "admitted",
    blood_type: "O+",
    ward: "Cardiology Ward 4B",
    admitted_at: "2026-08-20",
    primary_doctor: "Dr. Gregory House",
    allergies: ["Penicillin", "Sulfa Drugs"],
    conditions: [
      { id: "c1", condition_name: "Essential Hypertension", severity: "moderate", is_active: true },
      { id: "c2", condition_name: "Type 2 Diabetes Mellitus", severity: "moderate", is_active: true },
    ],
    medications: [
      { id: "m1", drug_name: "Amlodipine Besylate", dosage: "5mg", frequency: "Once Daily", status: "active" },
      { id: "m2", drug_name: "Metformin HCl", dosage: "500mg", frequency: "Twice Daily", status: "active" },
    ],
    treatment_plan_items: [],
    vitals: [
      { label: "Blood Pressure", value: "128/82", unit: "mmHg", flag: "normal" },
      { label: "Heart Rate", value: "72", unit: "bpm", flag: "normal" },
      { label: "SpO2", value: "98", unit: "%", flag: "normal" },
      { label: "Temperature", value: "36.8", unit: "°C", flag: "normal" },
    ],
    caseHistory: [],
    diagnostics: [],
    treatmentPlan: {
      id: "tp-1",
      title: "Cardiac Inpatient Monitoring & Glycemic Control",
      objectives: "Stabilize systemic arterial pressure and monitor fasting blood glucose daily.",
      status: "active",
    },
  };

  const patientPdfBytes = await generateClinicalSummaryPdf(mockPatient);
  const patientHeader = Buffer.from(patientPdfBytes.slice(0, 5)).toString("utf-8");
  console.log(`[PASS] Clinical Summary PDF generated: ${patientPdfBytes.byteLength} bytes (Magic: ${patientHeader})`);
  if (!patientHeader.startsWith("%PDF")) {
    throw new Error("Invalid PDF magic bytes for patient clinical summary");
  }

  console.log("\n✅ All PDF Generator contracts verified successfully!");
}

runTests().catch((err) => {
  console.error("PDF Engine test failed:", err);
  process.exit(1);
});
