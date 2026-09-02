import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") || "admin";
  const returnTo = searchParams.get("returnTo") || "/dashboard";

  const res = NextResponse.redirect(new URL(returnTo, req.url));
  res.cookies.set("medisync_dev_role", role, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return res;
}
