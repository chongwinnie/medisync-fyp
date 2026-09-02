import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const AUTH0_API_SETUP_HINT =
  "Authorize this application for the Auth0 API (identifier http://localhost:8000) under APIs → Application Access, then log out and log in again.";

async function getAccessToken(request: NextRequest, tokenResponse: NextResponse) {
  const audience = process.env.AUTH0_AUDIENCE;
  try {
    const tokenResult = audience
      ? await auth0.getAccessToken(request, tokenResponse, { audience })
      : await auth0.getAccessToken(request, tokenResponse);
    return tokenResult.token;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Token request failed";
    return { error: AUTH0_API_SETUP_HINT, detail };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const tokenResponse = new NextResponse();
  const tokenOrError = await getAccessToken(request, tokenResponse);
  if (typeof tokenOrError !== "string" || !tokenOrError) {
    return NextResponse.json(
      typeof tokenOrError === "object" && tokenOrError
        ? tokenOrError
        : { error: AUTH0_API_SETUP_HINT },
      { status: 401 }
    );
  }

  const aiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000";

  let upstream: Response;
  try {
    upstream = await fetch(
      `${aiUrl}/sessions/${encodeURIComponent(id)}/messages`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenOrError}` },
      }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json(
      { error: `Cannot reach AI backend at ${aiUrl}`, detail },
      { status: 502 }
    );
  }

  const body = await upstream.text();
  const response = new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
  tokenResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
