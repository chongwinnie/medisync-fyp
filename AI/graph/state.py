from __future__ import annotations
from typing import Any, Literal, TypedDict


class AgentState(TypedDict, total=False):
    messages: list[Any]           # LangChain BaseMessage or dict serializations
    user_id: str
    user_role: Literal["doctor", "nurse", "admin"]
    session_id: str
    active_agent: str | None
    context: dict                 # MUST default include patient_context: {}
    entry_mode: Literal["chat", "autonomous"]
    task: str | None              # autonomous entry: task payload (no user message). None for chat mode.


def initial_context() -> dict:
    """Default context dict — always include these keys."""
    return {
        "patient_context": {},
        "mem0_hits": [],
        "session_meta": {},
    }
