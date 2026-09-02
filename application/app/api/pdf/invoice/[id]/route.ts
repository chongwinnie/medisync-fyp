import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getInvoiceById } from "@/lib/data/billing";
import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await getInvoiceById(id);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get("download") === "1";

  const pdfBytes = await generateInvoicePdf(invoice, {
    name: user.name || "MediSync Officer",
    role: user.role === "admin" ? "Hospital Administrator" : "Clinical Operations",
  });

  const filename = `Invoice-${invoice.invoice_number || invoice.id}.pdf`;
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
