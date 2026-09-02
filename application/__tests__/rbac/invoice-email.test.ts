/**
 * invoice-email.test.ts — Unit Tests: Patient Invoice Email Dispatch Engine
 * ==========================================================================
 *
 * Tests the HTML tax invoice email generator, recipient formatting, and simulation modes.
 *
 * Run with:
 *   npx -y tsx --test __tests__/rbac/invoice-email.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateInvoiceEmailHtml } from "../../lib/email/invoice-email";
import type { Invoice } from "../../lib/data/billing";

const MOCK_INVOICE: Invoice = {
  id: "inv-test-12345",
  invoice_number: "INV-2026-999",
  patient_id: "pat-test-001",
  patient_name: "Alice Tan",
  patient_code: "PT-1042",
  appointment_id: null,
  line_items: [
    { description: "General Outpatient Consultation", quantity: 1, unit_price: 50.0 },
    { description: "Chest X-Ray (2 Views)", quantity: 1, unit_price: 75.0 },
  ],
  subtotal: 125.0,
  tax: 7.5,
  total_amount: 132.5,
  status: "sent",
  due_date: "2026-09-15",
  paid_at: null,
  notes: "Follow-up consultation in 2 weeks",
  created_at: "2026-08-29T10:00:00Z",
};

describe("generateInvoiceEmailHtml template engine", () => {
  it("includes hospital brand and invoice metadata in the output HTML", () => {
    const html = generateInvoiceEmailHtml(MOCK_INVOICE, "alice.tan@example.com");

    assert.ok(html.includes("MediSync Healthcare"), "Should include brand header");
    assert.ok(html.includes("INV-2026-999"), "Should include invoice number");
    assert.ok(html.includes("Alice Tan"), "Should include patient name");
    assert.ok(html.includes("PT-1042"), "Should include patient code");
    assert.ok(html.includes("alice.tan@example.com"), "Should include recipient email");
    assert.ok(html.includes("2026-09-15"), "Should include due date");
  });

  it("renders itemized line items with quantities and totals", () => {
    const html = generateInvoiceEmailHtml(MOCK_INVOICE, "alice.tan@example.com");

    assert.ok(html.includes("General Outpatient Consultation"));
    assert.ok(html.includes("Chest X-Ray (2 Views)"));
    assert.ok(html.includes("$125.00"), "Should include subtotal");
    assert.ok(html.includes("$7.50"), "Should include tax");
    assert.ok(html.includes("$132.50"), "Should include final total");
  });

  it("formats status badge correctly for paid invoices", () => {
    const paidInvoice: Invoice = {
      ...MOCK_INVOICE,
      status: "paid",
      paid_at: "2026-08-29T12:00:00Z",
    };
    const html = generateInvoiceEmailHtml(paidInvoice, "alice.tan@example.com");

    assert.ok(html.includes("PAID"), "Should include PAID badge");
    assert.ok(html.includes("Thank you for your payment"), "Should include receipt acknowledgment");
  });

  it("includes direct link to official downloadable PDF receipt", () => {
    const html = generateInvoiceEmailHtml(MOCK_INVOICE, "alice.tan@example.com");

    assert.ok(html.includes("/api/pdf/invoice/inv-test-12345?download=1"));
    assert.ok(html.includes("Download Official PDF Receipt"));
  });

  it("safely handles invoices without notes or taxes", () => {
    const minimalInvoice: Invoice = {
      ...MOCK_INVOICE,
      tax: 0,
      notes: null,
    };
    const html = generateInvoiceEmailHtml(minimalInvoice, "test@example.com");

    assert.ok(html.length > 500, "Should generate full valid HTML");
    assert.ok(html.includes("INV-2026-999"));
  });
});
