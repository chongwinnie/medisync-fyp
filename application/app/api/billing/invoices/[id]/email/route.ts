import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sendInvoiceEmail } from "@/lib/email/invoice-email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !["admin", "nurse"].includes(user.role)) {
    return NextResponse.json(
      { error: "Unauthorized: only Admin and Nurse can dispatch patient billing emails." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
  }

  let customEmail: string | undefined;
  try {
    const body = await req.json();
    customEmail = body?.email;
  } catch {
    // Body is optional
  }

  try {
    const result = await sendInvoiceEmail(id, customEmail);
    return NextResponse.json({
      success: true,
      message: `Invoice ${result.invoiceNumber} successfully emailed to ${result.recipient}.`,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to dispatch email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
