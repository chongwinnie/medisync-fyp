import { NextRequest, NextResponse } from "next/server";
const AI_BASE = process.env.AI_BACKEND_URL ?? "http://localhost:8000";
export async function GET(req: NextRequest) {
  const res = await fetch(`${AI_BASE}/knowledge/status`, {
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
