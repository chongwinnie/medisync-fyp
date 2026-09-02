"""Assemble AgentState from auth + memory + session + incoming message."""
from __future__ import annotations

from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from graph.state import AgentState, initial_context
from context.mem_search import search_memory
from context.session_load import load_session
from memory.mem0_client import format_mem0_prompt_block


def _sanitize_session_messages(history: list) -> list:
    """Convert Redis session dicts to LangChain messages; drop broken tool rows.

    Older sessions may contain {"role": "tool", "content": "..."} without
    tool_call_id, which raises KeyError inside create_react_agent.
    """
    cleaned: list = []
    for item in history or []:
        if isinstance(item, (HumanMessage, AIMessage, SystemMessage)):
            # Drop prior injected memory system messages on reload — we re-inject fresh
            if isinstance(item, SystemMessage) and "Long-term memory (Mem0)" in str(
                getattr(item, "content", "")
            ):
                continue
            cleaned.append(item)
            continue
        if not isinstance(item, dict):
            continue
        role = item.get("role") or item.get("type")
        content = str(item.get("content") or "")
        if role in ("user", "human") and content:
            cleaned.append(HumanMessage(content=content))
        elif role in ("assistant", "ai") and content:
            cleaned.append(AIMessage(content=content))
        # Skip tool / unknown roles — not safe to replay without tool_call_id
    return cleaned


async def assemble_agent_state(
    *,
    message: str,
    session_id: str,
    user_id: str,
    user_role: str,
    entry_mode: Literal["chat", "autonomous"] = "chat",
) -> AgentState:
    """Build the full AgentState before handing off to the LangGraph supervisor."""
    mem_hits = await search_memory(
        user_id,
        message,
        user_role=user_role,
    )
    history = _sanitize_session_messages(await load_session(session_id, user_id))

    new_message = HumanMessage(content=message)

    context = initial_context()
    context["mem0_hits"] = mem_hits
    mem0_block = format_mem0_prompt_block(mem_hits)
    context["mem0_prompt_block"] = mem0_block
    context["session_meta"] = {"session_id": session_id}

    messages: list = list(history)
    if mem0_block:
        messages = [SystemMessage(content=mem0_block)] + messages
    messages = messages + [new_message]

    return AgentState(
        messages=messages,
        user_id=user_id,
        user_role=user_role,  # type: ignore[typeddict-item]
        session_id=session_id,
        active_agent=None,
        context=context,
        entry_mode=entry_mode,  # type: ignore[typeddict-item]
    )
