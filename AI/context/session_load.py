"""Context pipeline: load conversation window from Redis; cold-hydrate from Postgres."""
from __future__ import annotations

import logging

from memory.session import redis_load_session, redis_save_session

logger = logging.getLogger("medisync.session_load")


async def load_session(session_id: str, user_id: str) -> list:
    """Load the conversation message window for this session.

    On Redis miss, hydrate from Postgres chat_messages then rewrite Redis.
    """
    try:
        history = await redis_load_session(session_id, user_id)
        if history:
            return history
    except Exception as exc:
        logger.warning("Redis load failed: %s", exc)
        history = []

    # Cold miss → Postgres L1
    try:
        from db.chat_history import load_messages_for_redis

        pg_messages = await load_messages_for_redis(
            auth0_sub=user_id,
            session_id=session_id,
        )
        if pg_messages:
            try:
                await redis_save_session(session_id, user_id, pg_messages)
            except Exception:
                pass
            return pg_messages
    except Exception as exc:
        logger.warning("Postgres hydrate failed: %s", exc)

    return []


async def save_session(session_id: str, user_id: str, messages: list) -> None:
    """Persist updated messages back to Redis after a turn."""
    try:
        await redis_save_session(session_id, user_id, messages)
    except Exception:
        pass  # non-fatal
