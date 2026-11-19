"""POST /chat SSE streaming endpoint."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from langsmith import traceable
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("medisync.chat")

# Prevent N-001 hangs when FreeLLMAPI / graph invoke never returns
GRAPH_INVOKE_TIMEOUT_SEC = 90


class ChatRequest(BaseModel):
    message: str
    session_id: str = ""


@traceable(
    name="MediSync Multi-Agent Chat",
    project_name="medisync-fyp",
)
def invoke_medisync_graph(state):
    """Invoke the LangGraph workflow with explicit LangSmith tracing."""
    from graph.graph import compiled_graph
    return compiled_graph.invoke(state)


async def _stream_graph(state, session_id: str, user_id: str):
    """Run the compiled graph and yield SSE events."""
    try:
        # Yield agent routing event
        yield f"data: {json.dumps({'type': 'agent', 'name': 'supervisor'})}\n\n"

        # Invoke graph in worker thread
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(invoke_medisync_graph, state),
                timeout=GRAPH_INVOKE_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'The AI took too long to respond. Please try again.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        messages = result.get("messages", [])
        active_agent = result.get("active_agent", "supervisor")

        # Yield agent name
        yield f"data: {json.dumps({'type': 'agent', 'name': active_agent})}\n\n"

        # Stream the last AI message as tokens
        last_content = ""
        for msg in reversed(messages):
            if hasattr(msg, "type") and msg.type == "ai":
                last_content = str(msg.content)
                break

        if not last_content.strip():
            last_content = (
                "I processed your request but have no text response to show. "
                "Please try rephrasing your question."
            )

        words = last_content.split()
        for i, word in enumerate(words):
            token = word + (" " if i < len(words) - 1 else "")
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            await asyncio.sleep(0.02)

        # Write-back after response
        try:
            from memory.write_back import write_back
            await write_back(result)
        except Exception:
            pass

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as exc:
        logger.error(
            "Chat stream failed: %s",
            exc,
            exc_info=(type(exc), exc, exc.__traceback__),
        )

        yield f"data: {json.dumps({'type': 'error', 'message': 'Sorry, something went wrong while processing your request. Please try again.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/chat")
async def chat(request: Request, body: ChatRequest):
    user_id = getattr(request.state, "user_id", "anonymous")
    user_role = getattr(request.state, "user_role", "doctor")
    session_id = body.session_id or str(uuid.uuid4())

    from context.state_assembler import assemble_agent_state

    state = await assemble_agent_state(
        message=body.message,
        session_id=session_id,
        user_id=user_id,
        user_role=user_role,
    )

    async def _with_session_event():
        # Echo stable session id so FE can sync if server minted one
        yield f"data: {json.dumps({'type': 'session', 'id': session_id})}\n\n"

        async for chunk in _stream_graph(state, session_id, user_id):
            yield chunk

    return StreamingResponse(
        _with_session_event(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )