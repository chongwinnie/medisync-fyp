/**
 * invoice-email.ts — Patient Invoice Email Dispatch & HTML Template Engine
 * =========================================================================
 *
 * Formats responsive, branded hospital billing emails and dispatches them
 * to patients upon invoice creation or manual dispatch.
 */

import { getInvoiceById, type Invoice } from "@/lib/data/billing";
import { createClient } from "@/lib/supabase/server";

export interface EmailDispatchResult {
  success: boolean;
  recipient: string;
  invoiceNumber: string;
  subject: string;
  htmlContent: string;
  simulated: boolean;
  error?: string;
}

/**
 * Generate a responsive, professional HTML Tax Invoice & Receipt email
 */
export function generateInvoiceEmailHtml(invoice: Invoice, recipientEmail: string): string {
  const isPaid = invoice.status === "paid";
  const statusLabel = isPaid ? "PAID &amp; SETTLED" : invoice.status.toUpperCase();
  const statusColor = isPaid ? "#16a34a" : invoice.status === "overdue" ? "#dc2626" : "#0062a1";
  const statusBg = isPaid ? "#f0fdf4" : invoice.status === "overdue" ? "#fef2f2" : "#eff6ff";

  const rows = (invoice.line_items || []).map((item, idx) => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 10px 8px; font-size: 13px; color: #334155;">${idx + 1}. ${item.description}</td>
      <td style="padding: 10px 8px; font-size: 13px; color: #64748b; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px 8px; font-size: 13px; color: #64748b; text-align: right;">$${Number(item.unit_price).toFixed(2)}</td>
      <td style="padding: 10px 8px; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">$${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    <!-- Header -->
    <tr>
      <td style="background-color: #002444; padding: 24px 32px; text-align: left;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">MediSync Healthcare</h1>
              <p style="margin: 4px 0 0; color: #94a3b8; font-size: 12px;">Official Medical Invoice &amp; Tax Statement</p>
            </td>
            <td style="text-align: right;">
              <span style="display: inline-block; padding: 6px 12px; background-color: ${statusBg}; color: ${statusColor}; font-size: 11px; font-weight: 700; border-radius: 20px; text-transform: uppercase;">
                ${statusLabel}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 32px;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #1e293b;">
          Dear <strong>${invoice.patient_name || "Valued Patient"}</strong> (${invoice.patient_code || "N/A"}),
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #64748b; line-height: 1.5;">
          ${isPaid
            ? "Thank you for your payment. Please find your official receipt and breakdown of services below."
            : "Your clinical encounter invoice is ready for review. Please find the itemized details and payment information below."
          }
        </p>

        <!-- Invoice Details Box -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 4px 8px; font-size: 12px; color: #64748b;"><strong>Invoice Number:</strong> ${invoice.invoice_number}</td>
            <td style="padding: 4px 8px; font-size: 12px; color: #64748b; text-align: right;"><strong>Date:</strong> ${new Date(invoice.created_at).toLocaleDateString("en-GB")}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px; font-size: 12px; color: #64748b;"><strong>Billed Recipient:</strong> ${recipientEmail}</td>
            <td style="padding: 4px 8px; font-size: 12px; color: #64748b; text-align: right;"><strong>Due Date:</strong> ${invoice.due_date || "Upon Receipt"}</td>
          </tr>
        </table>

        <!-- Line Items Table -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; text-align: left;">
              <th style="padding: 8px; font-size: 12px; color: #475569; text-transform: uppercase;">Service / Description</th>
              <th style="padding: 8px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: center;">Qty</th>
              <th style="padding: 8px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: right;">Price</th>
              <th style="padding: 8px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <!-- Totals Summary -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 2px solid #e2e8f0; padding-top: 12px; margin-bottom: 24px;">
          <tr>
            <td style="font-size: 13px; color: #64748b; padding: 4px 0;">Subtotal</td>
            <td style="font-size: 13px; color: #1e293b; text-align: right; font-weight: 600;">$${Number(invoice.subtotal).toFixed(2)}</td>
          </tr>
          ${invoice.tax > 0 ? `
          <tr>
            <td style="font-size: 13px; color: #64748b; padding: 4px 0;">Applicable Healthcare Tax</td>
            <td style="font-size: 13px; color: #1e293b; text-align: right; font-weight: 600;">$${Number(invoice.tax).toFixed(2)}</td>
          </tr>
          ` : ""}
          <tr>
            <td style="font-size: 16px; color: #002444; font-weight: 700; padding: 8px 0;">Total Amount</td>
            <td style="font-size: 18px; color: #0062a1; font-weight: 700; text-align: right; padding: 8px 0;">$${Number(invoice.total_amount).toFixed(2)}</td>
          </tr>
        </table>

        ${invoice.notes ? `
        <div style="background-color: #f1f5f9; border-left: 4px solid #0062a1; padding: 12px; border-radius: 4px; margin-bottom: 24px; font-size: 12px; color: #475569;">
          <strong>Clinical Notes:</strong> ${invoice.notes}
        </div>
        ` : ""}

        <!-- Action Button -->
        <div style="text-align: center; margin-top: 16px;">
          <a href="http://localhost:3000/api/pdf/invoice/${invoice.id}?download=1" style="display: inline-block; padding: 12px 28px; background-color: #0062a1; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; border-radius: 8px;">
            📄 Download Official PDF Receipt
          </a>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 11px; color: #94a3b8;">
          MediSync Healthcare Centre • Automated Medical Billing &amp; Electronic Health Records
        </p>
        <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
          For billing inquiries, contact billing@medisync.app or call (555) 019-2834.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Dispatch invoice email to patient
 */
export async function sendInvoiceEmail(
  invoiceId: string,
  customRecipient?: string
): Promise<EmailDispatchResult> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice '${invoiceId}' not found.`);
  }

  // Resolve recipient email: custom recipient > patient table email > fallback
  let recipient = (customRecipient || "").trim();
  if (!recipient) {
    try {
      const supabase = await createClient();
      const { data: patient } = await supabase
        .from("patients")
        .select("email, full_name, patient_code")
        .eq("id", invoice.patient_id)
        .maybeSingle();

      if (patient?.email) {
        recipient = patient.email;
      }
    } catch {
      // Database query failed, use fallback
    }
  }

  if (!recipient) {
    const safeCode = (invoice.patient_code || "patient").toLowerCase().replace(/[^a-z0-9]/g, "");
    recipient = `${safeCode}@patient.medisync.app`;
  }

  const subject = `[MediSync] Medical Invoice ${invoice.invoice_number} - $${Number(invoice.total_amount).toFixed(2)}`;
  const htmlContent = generateInvoiceEmailHtml(invoice, recipient);

  // If Resend or SMTP API key is configured, send real email
  const resendApiKey = process.env.RESEND_API_KEY;
  let simulated = true;

  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "MediSync Billing <billing@medisync.app>",
          to: [recipient],
          subject,
          html: htmlContent,
        }),
      });

      if (res.ok) {
        simulated = false;
      }
    } catch {
      simulated = true;
    }
  }

  // If invoice is in draft status, automatically transition to 'sent'
  if (invoice.status === "draft") {
    try {
      const supabase = await createClient();
      await supabase
        .from("invoices")
        .update({ status: "sent" })
        .eq("id", invoiceId);
    } catch {
      // Ignore writeback failure in mock mode
    }
  }

  return {
    success: true,
    recipient,
    invoiceNumber: invoice.invoice_number,
    subject,
    htmlContent,
    simulated,
  };
}
