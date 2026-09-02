import { NextRequest, NextResponse } from "next/server";
const AI_BASE = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ upload_id: string }> }) {
  const { upload_id } = await params;
  const res = await fetch(`${AI_BASE}/knowledge/document/${upload_id}`, {
    method: "DELETE",
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
