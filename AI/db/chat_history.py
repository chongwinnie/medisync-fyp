"""Postgres L1 durable chat transcript (chat_sessions / chat_messages)."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any
from uuid import UUID

from db.postgres import apg_connect
from db.users import resolve_user_uuid

logger = logging.getLogger("medisync.chat_history")


def _as_uuid(value: str) -> UUID | None:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


async def upsert_session_and_messages(
    *,
    auth0_sub: str,
    session_id: str,
    user_role: str,
    user_text: str,
    assistant_text: str,
    active_agent: str | None = None,
    entry_mode: str = "chat",
    title_hint: str | None = None,
) -> None:
    """Upsert chat_sessions + insert the last user/assistant turn. Fail-open."""
    session_uuid = _as_uuid(session_id)
    if not session_uuid or not auth0_sub:
        return

    user_uuid = await resolve_user_uuid(auth0_sub, role=user_role)
    if user_uuid is None:
        return

    title = (title_hint or user_text or "New conversation").strip()
    if len(title) > 48:
        title = title[:48] + "…"

    meta = {
        "agent": active_agent or "supervisor",
        "entry_mode": entry_mode,
    }

    try:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO chat_sessions (
                      id, user_id, title, supervisor_session_id,
                      role, last_message_at, metadata
                    )
                    VALUES ($1, $2, $3, $4, $5, now(), '{}'::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                      last_message_at = now(),
                      updated_at = now(),
                      title = CASE
                        WHEN chat_sessions.title IS NULL OR chat_sessions.title = ''
                          OR chat_sessions.title = 'New conversation'
                        THEN EXCLUDED.title
                        ELSE chat_sessions.title
                      END,
                      role = COALESCE(chat_sessions.role, EXCLUDED.role)
                    """,
                    session_uuid,
                    user_uuid,
                    title,
                    str(session_uuid),
                    user_role,
                )

                if user_text.strip():
                    await conn.execute(
                        """
                        INSERT INTO chat_messages (session_id, role, content, metadata)
                        VALUES ($1, 'user'::chat_message_role, $2, $3::jsonb)
                        """,
                        session_uuid,
                        user_text,
                        json.dumps({"entry_mode": entry_mode}),
                    )

                if assistant_text.strip():
                    await conn.execute(
                        """
                        INSERT INTO chat_messages (session_id, role, content, metadata)
                        VALUES ($1, 'assistant'::chat_message_role, $2, $3::jsonb)
                        """,
                        session_uuid,
                        assistant_text,
                        json.dumps(meta),
                    )
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("upsert_session_and_messages failed (non-fatal): %s", exc)


async def create_session(
    *,
    auth0_sub: str,
    user_role: str,
    title: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any] | None:
    """Create an empty chat_sessions row. Returns {id, title, ...} or None."""
    session_uuid = _as_uuid(session_id) if session_id else uuid.uuid4()
    if session_uuid is None:
        session_uuid = uuid.uuid4()

    user_uuid = await resolve_user_uuid(auth0_sub, role=user_role)
    if user_uuid is None:
        return None

    title_val = (title or "New conversation").strip()[:80] or "New conversation"

    try:
        conn = await apg_connect()
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_sessions (
                  id, user_id, title, supervisor_session_id, role, last_message_at, metadata
                )
                VALUES ($1, $2, $3, $4, $5, now(), '{}'::jsonb)
                ON CONFLICT (id) DO UPDATE SET updated_at = now()
                RETURNING id, title, role, created_at, updated_at, last_message_at
                """,
                session_uuid,
                user_uuid,
                title_val,
                str(session_uuid),
                user_role,
            )
            return _session_row_to_dict(row)
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("create_session failed: %s", exc)
        return None


async def list_sessions(
    *,
    auth0_sub: str,
    user_role: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """List sessions for the Auth0 user, optionally filtered by role."""
    user_uuid = await resolve_user_uuid(auth0_sub, role=user_role or "doctor")
    if user_uuid is None:
        return []

    try:
        conn = await apg_connect()
        try:
            # Hide empty "New conversation" shells (BUG-MEM0-3)
            if user_role:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.role, s.created_at, s.updated_at, s.last_message_at
                    FROM chat_sessions s
                    WHERE s.user_id = $1
                      AND (s.role IS NULL OR s.role = $2)
                      AND EXISTS (
                        SELECT 1 FROM chat_messages m WHERE m.session_id = s.id
                      )
                    ORDER BY COALESCE(s.last_message_at, s.updated_at, s.created_at) DESC
                    LIMIT $3
                    """,
                    user_uuid,
                    user_role,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.role, s.created_at, s.updated_at, s.last_message_at
                    FROM chat_sessions s
                    WHERE s.user_id = $1
                      AND EXISTS (
                        SELECT 1 FROM chat_messages m WHERE m.session_id = s.id
                      )
                    ORDER BY COALESCE(s.last_message_at, s.updated_at, s.created_at) DESC
                    LIMIT $2
                    """,
                    user_uuid,
                    limit,
                )
            return [_session_row_to_dict(r) for r in rows]
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("list_sessions failed: %s", exc)
        return []


async def get_session_messages(
    *,
    auth0_sub: str,
    session_id: str,
) -> list[dict[str, Any]] | None:
    """
    Return messages for a session owned by auth0_sub, or None if not found / not owned.
    """
    session_uuid = _as_uuid(session_id)
    if not session_uuid:
        return None

    user_uuid = await resolve_user_uuid(auth0_sub)
    if user_uuid is None:
        return None

    try:
        conn = await apg_connect()
        try:
            owned = await conn.fetchval(
                """
                SELECT 1 FROM chat_sessions
                WHERE id = $1 AND user_id = $2
                """,
                session_uuid,
                user_uuid,
            )
            if not owned:
                return None

            rows = await conn.fetch(
                """
                SELECT id, role, content, metadata, created_at
                FROM chat_messages
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_uuid,
            )
            return [
                {
                    "id": str(r["id"]),
                    "role": r["role"],
                    "content": r["content"],
                    "metadata": r["metadata"] or {},
                    "created_at": _dt_iso(r["created_at"]),
                }
                for r in rows
            ]
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("get_session_messages failed: %s", exc)
        return None


async def load_messages_for_redis(
    *,
    auth0_sub: str,
    session_id: str,
) -> list[dict[str, str]]:
    """Load user/assistant turns for Redis hydrate (role/content only)."""
    messages = await get_session_messages(auth0_sub=auth0_sub, session_id=session_id)
    if not messages:
        return []
    out: list[dict[str, str]] = []
    for m in messages:
        role = m.get("role")
        content = str(m.get("content") or "")
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": content})
    return out


async def delete_session(*, auth0_sub: str, session_id: str) -> bool:
    """Hard-delete a session owned by the user. Cascades messages."""
    session_uuid = _as_uuid(session_id)
    if not session_uuid:
        return False
    user_uuid = await resolve_user_uuid(auth0_sub)
    if user_uuid is None:
        return False
    try:
        conn = await apg_connect()
        try:
            result = await conn.execute(
                "DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2",
                session_uuid,
                user_uuid,
            )
            return result.endswith("1")
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("delete_session failed: %s", exc)
        return False


def _dt_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _session_row_to_dict(row) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row["title"] or "New conversation",
        "role": row["role"],
        "created_at": _dt_iso(row["created_at"]),
        "updated_at": _dt_iso(row["updated_at"]),
        "last_message_at": _dt_iso(row["last_message_at"]),
    }
