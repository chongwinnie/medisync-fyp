import { MediSyncPdfDocument } from "./pdf-builder";
import type { Invoice } from "@/lib/data/billing";

export async function generateInvoicePdf(
  invoice: Invoice,
  issuer: { name: string; role: string } = { name: "MediSync Billing Officer", role: "Hospital Administration" }
): Promise<Uint8Array> {
  const pdf = await MediSyncPdfDocument.create();

  // 1. Header
  pdf.drawHeader("PATIENT BILLING INVOICE & RECEIPT", "Official Tax Invoice Issued by MediSync Operations");

  // 2. Status Stamp
  pdf.drawStatusStamp(invoice.status);

  // 3. Metadata Grid (Patient Info vs Invoice Metadata)
  const issueDateFormatted = new Date(invoice.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const dueDateFormatted = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Upon Receipt";
  const paidDateFormatted = invoice.paid_at
    ? new Date(invoice.paid_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  pdf.drawMetaGrid(
    {
      title: "Patient / Billed To",
      rows: [
        ["Patient Name", invoice.patient_name || "Unknown Patient"],
        ["Patient Code", invoice.patient_code || "N/A"],
        ["Patient ID", invoice.patient_id.slice(0, 18) + "..."],
        ["Department", "General & Specialist Outpatient"],
      ],
    },
    {
      title: "Invoice Overview",
      rows: [
        ["Invoice #", invoice.invoice_number],
        ["Issue Date", issueDateFormatted],
        ["Due Date", dueDateFormatted],
        ["Payment Date", paidDateFormatted],
      ],
    }
  );

  // 4. Line Items Table
  const tableColumns = [
    { header: "#", width: 30, align: "center" as const },
    { header: "Description & Service Details", width: 260, align: "left" as const },
    { header: "Qty", width: 50, align: "center" as const },
    { header: "Unit Price", width: 85, align: "right" as const },
    { header: "Total ($)", width: 90, align: "right" as const },
  ];

  const items = invoice.line_items && invoice.line_items.length > 0
    ? invoice.line_items
    : [{ description: "Clinical Consultation & Care Services", quantity: 1, unit_price: invoice.subtotal || invoice.total_amount }];

  const tableRows = items.map((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    const lineTotal = qty * unitPrice;
    return {
      values: [
        String(idx + 1),
        item.description || "Medical Service Item",
        String(qty),
        `$${unitPrice.toFixed(2)}`,
        `$${lineTotal.toFixed(2)}`,
      ],
    };
  });

  pdf.drawTable(tableColumns, tableRows);

  // 5. Totals Breakdown
  pdf.drawTotalsBox([
    { label: "Subtotal:", value: `$${invoice.subtotal.toFixed(2)}` },
    { label: "Tax (Applicable 0-10%):", value: `$${invoice.tax.toFixed(2)}` },
    {
      label: invoice.status === "paid" ? "Total Paid:" : "Total Amount Due:",
      value: `$${invoice.total_amount.toFixed(2)}`,
      isTotal: true,
    },
  ]);

  // 6. Notes if present
  if (invoice.notes) {
    pdf.ensureSpace(40);
    pdf.page.drawText("NOTES / SPECIAL INSTRUCTIONS:", {
      x: pdf.margin,
      y: pdf.currentY,
      size: 8,
      font: pdf.fontBold,
      color: pdf.fontBold ? undefined : undefined,
    });
    pdf.page.drawText(invoice.notes, {
      x: pdf.margin,
      y: pdf.currentY - 12,
      size: 8,
      font: pdf.fontRegular,
    });
    pdf.currentY -= 30;
  }

  // 7. Cryptographic Digital Signature & Verification Seal
  const verificationPayload = JSON.stringify({
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    patient_id: invoice.patient_id,
    total_amount: invoice.total_amount,
    status: invoice.status,
    created_at: invoice.created_at,
  });

  pdf.drawDigitalSignature(issuer.name, issuer.role, verificationPayload);

  return await pdf.build();
}
