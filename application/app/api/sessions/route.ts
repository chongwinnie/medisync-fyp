import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const AUTH0_API_SETUP_HINT =
  "Authorize this application for the Auth0 API (identifier http://localhost:8000) under APIs → Application Access, then log out and log in again.";

const DEV_ROLES = ["doctor", "nurse", "admin"] as const;

async function getAccessToken(
  request: NextRequest,
  tokenResponse: NextResponse
) {
  const devRole = request.cookies.get("medisync_dev_role")?.value;
  const isDevLogin =
    !!devRole &&
    DEV_ROLES.includes(devRole as (typeof DEV_ROLES)[number]);

  if (isDevLogin) {
    return `dev-token-${devRole}`;
  }

  const session = await auth0.getSession(request);
  if (!session) {
    return { error: "Not authenticated" };
  }

  const audience = process.env.AUTH0_AUDIENCE;

  try {
    const tokenResult = audience
      ? await auth0.getAccessToken(request, tokenResponse, { audience })
      : await auth0.getAccessToken(request, tokenResponse);

    return tokenResult.token;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Token request failed";

    return { error: AUTH0_API_SETUP_HINT, detail };
  }
}

function aiBaseUrl() {
  return process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000";
}

export async function GET(request: NextRequest) {
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

  let upstream: Response;

  try {
    upstream = await fetch(`${aiBaseUrl()}/sessions`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenOrError}`,
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Connection failed";

    return NextResponse.json(
      {
        error: `Cannot reach AI backend at ${aiBaseUrl()}`,
        detail,
      },
      { status: 502 }
    );
  }

  const body = await upstream.text();

  const response = new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
    },
  });

  tokenResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}

export async function POST(request: NextRequest) {
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

  let body: { title?: string; id?: string } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${aiBaseUrl()}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOrError}`,
      },
      body: JSON.stringify({
        title: body.title,
        id: body.id,
      }),
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Connection failed";

    return NextResponse.json(
      {
        error: `Cannot reach AI backend at ${aiBaseUrl()}`,
        detail,
      },
      { status: 502 }
    );
  }

  const text = await upstream.text();

  const response = new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
    },
  });

  tokenResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}
