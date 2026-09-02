import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const AUTH0_API_SETUP_HINT =
  "Authorize this application for the Auth0 API (identifier http://localhost:8000) under APIs → Application Access, then log out and log in again.";

export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const audience = process.env.AUTH0_AUDIENCE;
  const tokenResponse = new NextResponse();
  let accessToken = "";

  try {
    const tokenResult = audience
      ? await auth0.getAccessToken(request, tokenResponse, { audience })
      : await auth0.getAccessToken(request, tokenResponse);
    accessToken = tokenResult.token;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Token request failed";
    return NextResponse.json(
      { error: AUTH0_API_SETUP_HINT, detail },
      { status: 401 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: AUTH0_API_SETUP_HINT },
      { status: 401 }
    );
  }

  let body: { message?: string; session_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const aiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000";

  let upstream: Response;
  try {
    upstream = await fetch(`${aiUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: body.message ?? "",
        session_id: body.session_id ?? "",
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json(
      {
        error: `Cannot reach AI backend at ${aiUrl}. Start it with: cd AI && uvicorn main:app --reload --port 8000`,
        detail,
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: text || `AI backend returned ${upstream.status}` },
      { status: upstream.status }
    );
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "AI backend returned empty body" }, { status: 502 });
  }

  const sseResponse = new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  tokenResponse.cookies.getAll().forEach((cookie) => {
    sseResponse.cookies.set(cookie);
  });

  return sseResponse;
}
