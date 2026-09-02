"""Resolve Auth0 sub → Postgres users.id (create row if missing)."""
from __future__ import annotations

import hashlib
import logging
import re
from uuid import UUID

from db.postgres import apg_connect

logger = logging.getLogger("medisync.users")

_VALID_ROLES = frozenset({"doctor", "nurse", "admin", "staff"})


def _placeholder_email(auth0_sub: str) -> str:
    digest = hashlib.sha256(auth0_sub.encode()).hexdigest()[:16]
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", auth0_sub)[:48]
    return f"{safe}.{digest}@auth0.medisync.local"


async def resolve_user_uuid(
    auth0_sub: str,
    *,
    role: str = "doctor",
    email: str | None = None,
) -> UUID | None:
    """
    Look up users.id by auth0_sub. Inserts a minimal row if missing so
    chat_sessions FK inserts succeed. Returns None on DB failure (fail-open).
    """
    if not auth0_sub or auth0_sub == "anonymous":
        return None

    role_norm = role.lower() if role in _VALID_ROLES else "doctor"
    email_val = email or _placeholder_email(auth0_sub)

    try:
        conn = await apg_connect()
        try:
            row = await conn.fetchrow(
                "SELECT id FROM users WHERE auth0_sub = $1",
                auth0_sub,
            )
            if row:
                await conn.execute(
                    "UPDATE users SET last_login = now(), updated_at = now() WHERE id = $1",
                    row["id"],
                )
                return row["id"]

            new_id = await conn.fetchval(
                """
                INSERT INTO users (auth0_sub, email, role, is_active, email_verified)
                VALUES ($1, $2, $3::user_role, true, false)
                ON CONFLICT (auth0_sub) DO UPDATE
                  SET last_login = now(), updated_at = now()
                RETURNING id
                """,
                auth0_sub,
                email_val,
                role_norm,
            )
            return new_id
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("resolve_user_uuid failed (non-fatal): %s", exc)
        return None
