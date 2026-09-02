"""Post-turn write-back: Mem0 add + audit + Redis + Postgres L1 (parallel)."""
from __future__ import annotations

import asyncio
import logging

from graph.state import AgentState
from memory.mem0_client import add_memory
from context.session_load import save_session
from tools.audit_logging import write_audit_log

logger = logging.getLogger("medisync.write_back")


def _last_user_assistant_texts(messages: list) -> tuple[str, str]:
    user_text = ""
    assistant_text = ""
    for m in reversed(messages or []):
        msg_type = getattr(m, "type", None)
        content = str(getattr(m, "content", "") or "")
        if not content:
            continue
        if msg_type == "ai" and not getattr(m, "tool_calls", None) and not assistant_text:
            assistant_text = content
        elif msg_type == "human" and not user_text:
            user_text = content
        if user_text and assistant_text:
            break
    return user_text, assistant_text


def _serialize_human_ai(messages: list) -> list[dict]:
    serialized: list[dict] = []
    for m in messages:
        msg_type = getattr(m, "type", None)
        content = str(getattr(m, "content", "") or "")
        if msg_type == "human" and content:
            serialized.append({"role": "user", "content": content})
        elif msg_type == "ai" and content and not getattr(m, "tool_calls", None):
            serialized.append({"role": "assistant", "content": content})
    return serialized


async def write_back(state: AgentState) -> None:
    """
    After supervisor produces a response, run in parallel:
    1. Add new messages to Mem0 long-term memory
    2. Write audit record to PostgreSQL
    3. Update Redis session with latest messages
    4. Persist durable transcript to Postgres chat_sessions / chat_messages

    Non-fatal: any failure is logged but does not break the response.
    """
    user_id = state.get("user_id", "")
    session_id = state.get("session_id", "")
    messages = state.get("messages", [])
    active_agent = state.get("active_agent", "supervisor")
    entry_mode = state.get("entry_mode", "chat")
    user_role = state.get("user_role", "doctor")
    context = state.get("context") or {}
    patient_context = context.get("patient_context") or {}
    patient_id = patient_context.get("patient_id")
    mem0_hits = context.get("mem0_hits") or []

    user_text, assistant_text = _last_user_assistant_texts(messages)

    async def _mem0_task():
        if not user_id or not (user_text or assistant_text):
            return
        meta = {
            "role": user_role,
            "entry_mode": entry_mode,
        }
        if patient_id:
            meta["patient_id"] = str(patient_id)
        turn = []
        if user_text:
            turn.append({"role": "user", "content": user_text})
        if assistant_text:
            turn.append({"role": "assistant", "content": assistant_text})
        await add_memory(
            user_id,
            turn,
            agent_id=active_agent or "supervisor",
            run_id=session_id or None,
            metadata=meta,
        )

    async def _audit_task():
        try:
            write_audit_log.invoke({
                "action": "agent_response",
                "entity_type": "chat_session",
                "entity_id": "",
                "details": {
                    "agent": active_agent,
                    "entry_mode": entry_mode,
                    "session_id": session_id,
                    "message_count": len(messages),
                    "mem0_hit_count": len(mem0_hits) if isinstance(mem0_hits, list) else 0,
                },
                "user_id": user_id,
                "table_name": "ai_agent_logs",
            })
        except Exception:
            pass

    async def _redis_task():
        if user_id and session_id and messages:
            serialized = _serialize_human_ai(messages)
            await save_session(session_id, user_id, serialized)

    async def _postgres_task():
        if not user_id or not session_id:
            return
        if not user_text and not assistant_text:
            return
        try:
            from db.chat_history import upsert_session_and_messages

            await upsert_session_and_messages(
                auth0_sub=user_id,
                session_id=session_id,
                user_role=user_role,
                user_text=user_text,
                assistant_text=assistant_text,
                active_agent=active_agent,
                entry_mode=entry_mode,
                title_hint=user_text,
            )
        except Exception as exc:
            logger.warning("Postgres L1 write failed: %s", exc)

    await asyncio.gather(
        _mem0_task(),
        _audit_task(),
        _redis_task(),
        _postgres_task(),
        return_exceptions=True,
    )
