"""Memory search — calls Mem0 for long-term context retrieval."""
from __future__ import annotations


async def search_memory(
    user_id: str,
    query: str,
    *,
    limit: int = 5,
    agent_id: str | None = None,
    patient_id: str | None = None,
    user_role: str | None = None,
) -> list[dict]:
    """Retrieve relevant long-term memories from Mem0 (fail-open → [])."""
    try:
        from memory.mem0_client import search_memory as mem0_search

        return await mem0_search(
            user_id=user_id,
            query=query,
            limit=limit,
            agent_id=agent_id,
            patient_id=patient_id,
            user_role=user_role,
        )
    except Exception:
        return []
