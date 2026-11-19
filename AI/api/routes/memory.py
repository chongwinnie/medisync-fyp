"""GET /memory REST endpoint for inspecting Mem0 long-term agent memories."""
from __future__ import annotations

import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/memory", tags=["memory"])
logger = logging.getLogger("medisync.memory_route")


@router.get("")
async def list_memories(request: Request):
    """List all long-term memories stored in ChromaDB medisync_mem0."""
    try:
        from config.settings import settings
        import chromadb

        client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        try:
            col = client.get_collection(settings.mem0_collection_name)
        except Exception:
            return {"memories": [], "total": 0, "status": "empty"}

        res = col.get()
        ids = res.get("ids", [])
        metadatas = res.get("metadatas", [])

        memories = []
        for idx, (m_id, meta) in enumerate(zip(ids, metadatas), start=1):
            meta = meta or {}
            memories.append({
                "id": m_id,
                "index": idx,
                "content": meta.get("data", ""),
                "role": meta.get("role", "unknown"),
                "agent_id": meta.get("agent_id", "unknown"),
                "user_id": meta.get("user_id", "unknown"),
                "created_at": meta.get("created_at", ""),
                "entry_mode": meta.get("entry_mode", "chat")
            })

        # Sort newest first
        memories.sort(key=lambda m: m["created_at"], reverse=True)
        return {"memories": memories, "total": len(memories), "status": "ok"}
    except Exception as exc:
        logger.error("Failed to fetch memories: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)


@router.get("/search")
async def search_memories(request: Request, q: str = ""):
    """Semantic search over long-term agent memories."""
    if not q.strip():
        return await list_memories(request)
    try:
        user_id = getattr(request.state, "user_id", "dev-user-doctor")
        from memory.mem0_client import search_memory
        hits = await search_memory(user_id=user_id, query=q, limit=10)
        return {"query": q, "hits": hits, "total": len(hits)}
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
