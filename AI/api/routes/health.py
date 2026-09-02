"""GET /health endpoint."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/health")
async def health_check():
    status = {
        "postgres": "error",
        "redis": "error",
        "chroma": "error",
        "mem0": "off",
    }
    overall = "ok"

    try:
        from db.postgres import engine
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        status["postgres"] = "ok"
    except Exception:
        overall = "degraded"

    try:
        from db.redis_client import get_redis
        r = get_redis()
        await r.ping()
        status["redis"] = "ok"
    except Exception:
        overall = "degraded"

    try:
        from db.chroma import get_chroma_client
        await get_chroma_client()
        status["chroma"] = "ok"
    except Exception:
        overall = "degraded"

    try:
        import asyncio

        from memory.mem0_client import mem0_status, warm_mem0_search

        status["mem0"] = mem0_status()
        if status["mem0"] == "error":
            overall = "degraded"
        elif status["mem0"] == "ok":
            # Non-blocking warm — do not stall /health on first embed
            try:
                asyncio.create_task(warm_mem0_search())
            except Exception:
                pass
    except Exception:
        status["mem0"] = "error"
        overall = "degraded"

    return JSONResponse({"status": overall, **status})
