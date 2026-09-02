"""Auth0 JWT validation middleware for FastAPI."""
from __future__ import annotations

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class Auth0Middleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth on health and OPTIONS
        if request.url.path in {"/health", "/"} or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            # Check dev role from header or cookie for Next.js server actions & dev mode
            dev_role = (
                request.headers.get("x-user-role")
                or request.cookies.get("medisync_dev_role")
            )
            if dev_role and str(dev_role).lower() in {"doctor", "nurse", "admin"}:
                request.state.user_id = request.headers.get("x-user-id") or f"dev-user-{dev_role.lower()}"
                request.state.user_role = str(dev_role).lower()
                return await call_next(request)

            return JSONResponse({"error": "Missing or invalid Authorization header"}, status_code=401)

        token = auth_header.split(" ", 1)[1].strip()

        # Support dev-token-<role> convention for internal server action calls
        if token.startswith("dev-token-"):
            role = token.replace("dev-token-", "").lower()
            if role in {"doctor", "nurse", "admin"}:
                request.state.user_id = request.headers.get("x-user-id") or f"dev-user-{role}"
                request.state.user_role = role
                return await call_next(request)

        try:
            from context.auth import decode_auth0_jwt
            user_id, user_role = decode_auth0_jwt(token)
            request.state.user_id = user_id
            request.state.user_role = user_role
        except ValueError as exc:
            return JSONResponse({"error": str(exc)}, status_code=401)

        return await call_next(request)
