import { NextRequest, NextResponse } from "next/server";

const AI_BASE = process.env.AI_BACKEND_URL ?? "http://localhost:8000";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const res = await fetch(`${AI_BASE}/billing/invoices/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
