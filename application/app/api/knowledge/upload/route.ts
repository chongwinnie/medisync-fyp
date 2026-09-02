import { NextRequest, NextResponse } from "next/server";
const AI_BASE = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const res = await fetch(`${AI_BASE}/knowledge/upload`, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "" },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
