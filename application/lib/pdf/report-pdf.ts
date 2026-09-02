import { MediSyncPdfDocument } from "./pdf-builder";
import type { HospitalReport } from "@/lib/data/reports";

export async function generateHospitalReportPdf(
  report: HospitalReport,
  auditor: { name: string; role: string } = { name: "Chief Medical Officer / Admin", role: "Hospital Executive Board" }
): Promise<Uint8Array> {
  const pdf = await MediSyncPdfDocument.create();

  // 1. Header
  pdf.drawHeader("HOSPITAL MANAGEMENT & AUDIT REPORT", "Executive Performance & Clinical Operations Summary");

  // 2. Status Stamp
  pdf.drawStatusStamp("OFFICIAL AUDIT");

  // 3. Metadata Grid
  const genDate = new Date(report.generated_at).toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });

  pdf.drawMetaGrid(
    {
      title: "Audit & Facility Overview",
      rows: [
        ["Facility", "MediSync Health Center Main"],
        ["Audit Period", "Current Operating Month"],
        ["Classification", "CONFIDENTIAL / INTERNAL AUDIT"],
        ["System Core", "MediSync AI Hospital Suite 2.0"],
      ],
    },
    {
      title: "Executive Generation Info",
      rows: [
        ["Generated Date", genDate],
        ["Authorized By", auditor.name],
        ["Audit Scope", "Hospital-Wide Operations"],
        ["Record Status", "VERIFIED & AUDITED"],
      ],
    }
  );

  // 4. Section Tables
  const columns = [
    { header: "Operational Domain & Metric", width: 280, align: "left" as const },
    { header: "Metric Count / Value", width: 140, align: "center" as const },
    { header: "Operational Status", width: 95, align: "right" as const },
  ];

  const rows = [
    // Patients
    { values: ["Total Registered Patients", String(report.patients.total), "Active Roster"], bold: true },
    { values: ["  • Inpatient Admitted", String(report.patients.admitted), report.patients.admitted > 0 ? "Under Care" : "Nominal"] },
    { values: ["  • Outpatient Registered", String(report.patients.outpatient), "Nominal"] },
    { values: ["  • Discharged Patients", String(report.patients.discharged), "Completed"] },
    { values: ["  • New Patients This Month", String(report.patients.new_this_month), "Growth"] },

    // Appointments
    { values: ["Appointments Total (This Month)", String(report.appointments.total_this_month), "Volume"], bold: true },
    { values: ["  • Successfully Completed", String(report.appointments.completed), "Completed"] },
    { values: ["  • Cancelled Visits", String(report.appointments.cancelled), "Normal Rate"] },
    { values: ["  • Patient No-Shows", String(report.appointments.no_shows), report.appointments.no_shows > 0 ? "Flagged" : "Zero"] },
    { values: ["  • Scheduled Today", String(report.appointments.today_scheduled), "Active Queue"] },
    { values: ["  • Overall Completion Rate", report.appointments.completion_rate, "Target > 85%"] },

    // Inventory
    { values: ["Medical Inventory & Stock Items", String(report.inventory.total_items), "Active Catalog"], bold: true },
    { values: ["  • Low Stock Warning Items", String(report.inventory.low_stock), report.inventory.low_stock > 0 ? "Reorder Needed" : "Adequate"] },
    { values: ["  • Expiring Soon (< 30 Days)", String(report.inventory.expiring_soon), report.inventory.expiring_soon > 0 ? "Action Required" : "Safe"] },

    // Staff
    { values: ["Hospital Staff & Medical Workforce", String(report.staff.total), "Active Staff"], bold: true },
    { values: ["  • Physicians & Specialists", String(report.staff.doctors), "On Register"] },
    { values: ["  • Nursing Staff", String(report.staff.nurses), "On Register"] },
    { values: ["  • Administrative & Ops Personnel", String(report.staff.admins), "On Register"] },
    { values: ["  • Personnel on Duty Today", String(report.staff.on_shift_today), "On Duty"] },
    { values: ["  • Shift Scheduling Conflicts", String(report.staff.shift_conflicts), report.staff.shift_conflicts > 0 ? "Requires Resolution" : "Zero Conflicts"] },

    // Financial
    { values: ["Financial & Billing Performance", `$${report.billing.revenue_collected.toFixed(2)}`, "Revenue YTD"], bold: true },
    { values: ["  • Invoices Processed (This Month)", String(report.billing.invoices_this_month), "Invoices"] },
    { values: ["  • Revenue Collected", `$${report.billing.revenue_collected.toFixed(2)}`, "Collected"] },
    { values: ["  • Total Outstanding Receivable", `$${report.billing.outstanding.toFixed(2)}`, report.billing.outstanding > 0 ? "Receivable" : "Settled"] },
    { values: ["  • Overdue Unsettled Invoices", String(report.billing.overdue_count), report.billing.overdue_count > 0 ? "Follow-Up Required" : "Zero Overdue"] },
  ];

  pdf.drawTable(columns, rows);

  // 5. Digital Certification & Integrity Hash
  const reportPayload = JSON.stringify({
    generated_at: report.generated_at,
    patients_total: report.patients.total,
    revenue_collected: report.billing.revenue_collected,
    outstanding: report.billing.outstanding,
    staff_total: report.staff.total,
  });

  pdf.drawDigitalSignature(auditor.name, auditor.role, reportPayload);

  return await pdf.build();
}
