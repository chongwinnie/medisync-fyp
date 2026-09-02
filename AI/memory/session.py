"""Redis helpers for conversation session state."""
from __future__ import annotations

import json
from db.redis_client import get_redis

# 7 days — refreshed on each save; cold miss hydrates from Postgres
SESSION_TTL = 7 * 24 * 3600


def _session_key(session_id: str, user_id: str) -> str:
    return f"session:{user_id}:{session_id}"


async def redis_load_session(session_id: str, user_id: str) -> list:
    r = get_redis()
    raw = await r.get(_session_key(session_id, user_id))
    if raw is None:
        return []
    return json.loads(raw)


async def redis_save_session(session_id: str, user_id: str, messages: list) -> None:
    r = get_redis()
    await r.setex(
        _session_key(session_id, user_id),
        SESSION_TTL,
        json.dumps(messages, default=str),
    )
