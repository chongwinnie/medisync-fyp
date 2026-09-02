"""Chat session REST — list / create / load messages / delete."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/sessions", tags=["sessions"])


class CreateSessionBody(BaseModel):
    title: str | None = None
    id: str | None = Field(default=None, description="Optional client-minted UUID")


@router.get("")
async def list_sessions(request: Request):
    user_id = getattr(request.state, "user_id", "")
    user_role = getattr(request.state, "user_role", "doctor")
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    from db.chat_history import list_sessions as db_list

    sessions = await db_list(auth0_sub=user_id, user_role=user_role)
    return {"sessions": sessions}


@router.post("")
async def create_session(request: Request, body: CreateSessionBody):
    user_id = getattr(request.state, "user_id", "")
    user_role = getattr(request.state, "user_role", "doctor")
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    from db.chat_history import create_session as db_create

    row = await db_create(
        auth0_sub=user_id,
        user_role=user_role,
        title=body.title,
        session_id=body.id,
    )
    if row is None:
        return JSONResponse(
            {"error": "Failed to create session (check DATABASE_URL / users table)"},
            status_code=503,
        )
    return row


@router.get("/{session_id}/messages")
async def get_messages(request: Request, session_id: str):
    user_id = getattr(request.state, "user_id", "")
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    from db.chat_history import get_session_messages
    from context.session_load import save_session

    messages = await get_session_messages(auth0_sub=user_id, session_id=session_id)
    if messages is None:
        return JSONResponse({"error": "Session not found"}, status_code=404)

    # Hydrate Redis hot window on resume
    try:
        redis_msgs = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]
        await save_session(session_id, user_id, redis_msgs)
    except Exception:
        pass

    return {"session_id": session_id, "messages": messages}


@router.delete("/{session_id}")
async def delete_session(request: Request, session_id: str):
    user_id = getattr(request.state, "user_id", "")
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    from db.chat_history import delete_session as db_delete

    ok = await db_delete(auth0_sub=user_id, session_id=session_id)
    if not ok:
        return JSONResponse({"error": "Session not found"}, status_code=404)
    return {"deleted": True, "id": session_id}
