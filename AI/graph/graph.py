"""LangGraph StateGraph — full wiring by Agent 99."""
from __future__ import annotations

import asyncio
import time

from langgraph.graph import StateGraph, END

from graph.state import AgentState, initial_context
from graph.supervisor import supervisor_node
from agents.clinical.patient_management import patient_management_node
from agents.clinical.medical_diagnostics import medical_diagnostics_node
from agents.operational.appointment_scheduling import appointment_scheduling_node
from agents.operational.inventory_resource import inventory_resource_node
from agents.operational.staff_management import staff_management_node


def _route_from_supervisor(state: AgentState) -> str:
    """Fallback router: read active_agent set by supervisor Command update.

    Hard-deny leaves active_agent='supervisor' and must end the turn (not re-enter
    the supervisor node). Unknown/empty → __end__.
    """
    agent = state.get("active_agent")
    if not agent or agent == "supervisor":
        return "__end__"
    return agent


builder = StateGraph(AgentState)

builder.add_node("supervisor", supervisor_node)
builder.add_node("patient_management", patient_management_node)
builder.add_node("medical_diagnostics", medical_diagnostics_node)
builder.add_node("appointment_scheduling", appointment_scheduling_node)
builder.add_node("inventory_resource", inventory_resource_node)
builder.add_node("staff_management", staff_management_node)

builder.set_entry_point("supervisor")

# Supervisor uses Command(goto=...) for routing — declare all reachable destinations
builder.add_conditional_edges(
    "supervisor",
    _route_from_supervisor,
    {
        "patient_management": "patient_management",
        "medical_diagnostics": "medical_diagnostics",
        "appointment_scheduling": "appointment_scheduling",
        "inventory_resource": "inventory_resource",
        "staff_management": "staff_management",
        "supervisor": END,  # hard-deny / no-route terminal
        "__end__": END,
    },
)

# All agent nodes return to END after their turn
for _agent_node in [
    "patient_management",
    "medical_diagnostics",
    "appointment_scheduling",
    "inventory_resource",
    "staff_management",
]:
    builder.add_edge(_agent_node, END)

compiled_graph = builder.compile()


VALID_AUTONOMOUS_AGENTS = (
    "patient_management",
    "medical_diagnostics",
    "appointment_scheduling",
    "inventory_resource",
    "staff_management",
)


def run_autonomous(
    target_agent: str,
    task: str,
    *,
    user_id: str = "system",
    user_role: str = "admin",
    session_id: str | None = None,
    recursion_limit: int = 16,
) -> dict:
    """Unified autonomous entry path (Celery → graph → supervisor → node → write-back).

    Constructs a minimal AgentState with entry_mode="autonomous", dispatches through
    the compiled graph (supervisor autonomous branch → target node), then runs
    post-turn write-back (audit + Mem0 + Redis). No human input, no SSE.

    Returns a summary dict with the final assistant message and the active agent.
    """
    if target_agent not in VALID_AUTONOMOUS_AGENTS:
        raise ValueError(
            f"Unknown autonomous agent '{target_agent}'. "
            f"Valid: {VALID_AUTONOMOUS_AGENTS}"
        )

    sid = session_id or f"celery-{target_agent}-{time.strftime('%Y%m%d%H%M%S')}"
    state: AgentState = {
        "messages": [],
        "user_id": user_id,
        "user_role": user_role,  # type: ignore[typeddict-item]
        "session_id": sid,
        "active_agent": target_agent,
        "context": {**initial_context(), "session_meta": {"triggered_by": "celery_beat"}},
        "entry_mode": "autonomous",
        "task": task,
    }

    result = compiled_graph.invoke(
        state, config={"recursion_limit": recursion_limit}
    )

    # Post-turn write-back (audit + Mem0 + Redis). Non-fatal.
    try:
        from memory.write_back import write_back
        asyncio.run(write_back(result))
    except Exception:
        pass

    messages = result.get("messages", [])
    last_msg = ""
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if content is not None:
            last_msg = str(content)
            break

    return {
        "status": "ok",
        "agent": result.get("active_agent", target_agent),
        "session_id": sid,
        "summary": last_msg[:500] or "No response",
    }
