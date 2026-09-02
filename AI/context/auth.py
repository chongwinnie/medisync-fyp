"""Auth0 JWT validation and role extraction."""
from __future__ import annotations

from typing import Literal

import httpx
from jose import jwt, JWTError

from config.settings import settings

ROLE_CLAIM = "https://medisync.app/role"
ROLE_CLAIM_FALLBACKS = (
    ROLE_CLAIM,
    "https://localhost:3000/role",  # legacy action namespace
    "role",
)
VALID_ROLES = frozenset({"doctor", "nurse", "admin"})


def _get_jwks(auth0_domain: str) -> dict:
    """Fetch JWKS from Auth0 (cached in module scope for reuse)."""
    url = f"https://{auth0_domain}/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


_jwks_cache: dict | None = None


def decode_auth0_jwt(token: str) -> tuple[str, Literal["doctor", "nurse", "admin"]]:
    """
    Validate an Auth0 JWT (RS256) and extract user_id + role.

    Returns:
        (user_id, role) — user_id is the Auth0 `sub` claim.

    Raises:
        ValueError: if token is invalid or role is not in VALID_ROLES.
    """
    global _jwks_cache

    auth0_domain = settings.auth0_domain
    audience = settings.auth0_audience

    if not auth0_domain:
        raise ValueError("AUTH0_DOMAIN env var is not set")

    if _jwks_cache is None:
        _jwks_cache = _get_jwks(auth0_domain)

    try:
        payload = jwt.decode(
            token,
            _jwks_cache,
            algorithms=["RS256"],
            audience=audience or None,
            issuer=f"https://{auth0_domain}/",
            options={"verify_exp": True},
        )
    except JWTError as exc:
        raise ValueError(f"JWT validation failed: {exc}") from exc

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise ValueError("JWT missing 'sub' claim")

    # Role from custom namespace claim, with legacy fallbacks
    role_raw = ""
    for claim_key in ROLE_CLAIM_FALLBACKS:
        value = payload.get(claim_key)
        if value:
            role_raw = value
            break
    role = str(role_raw).lower()

    # Match Next.js extractRole(): staff / unknown → doctor
    if role not in VALID_ROLES:
        if role in {"", "staff"}:
            role = "doctor"
        else:
            raise ValueError(f"JWT role '{role}' is not in {VALID_ROLES}")

    return user_id, role  # type: ignore[return-value]
