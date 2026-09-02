"""Supervisor Node — intent classification, role-gating, and Command routing."""
from __future__ import annotations

import json
import re
from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage
from langgraph.types import Command

from config.llm import get_chat_llm
from graph.state import AgentState

# Role-gating: which agents each role can access
ROLE_AGENT_ACCESS: dict[str, set[str]] = {
    "doctor": {"patient_management", "medical_diagnostics"},
    "nurse": {"patient_management", "medical_diagnostics", "inventory_resource"},
    "admin": {"patient_management", "medical_diagnostics", "appointment_scheduling", "inventory_resource", "staff_management"},
}

AGENT_TARGETS = Literal[
    "patient_management", "medical_diagnostics", "appointment_scheduling",
    "inventory_resource", "staff_management"
]

VALID_AGENTS = {
    "patient_management",
    "medical_diagnostics",
    "appointment_scheduling",
    "inventory_resource",
    "staff_management",
}

INTENT_CLASSIFICATION_PROMPT = """You are the MediSync Supervisor Agent. Your job is to classify the user's intent to the correct specialist agent.

Available agents and their responsibilities:
- patient_management: patient profiles, medications, treatment plans, case history
- medical_diagnostics: medical reports, image analysis, diagnostic findings, lab results
- appointment_scheduling: scheduling, conflicts, queue management, calendar, reminders
- inventory_resource: stock queries, bed/room allocation, theatre bookings, inventory alerts
- staff_management: shifts, attendance, payroll, staff reports, HR queries

Classify the TRUE intent based on the user message alone. Do NOT remap to a different agent based on role — role enforcement happens separately.

Examples:
- "Generate payroll for nursing staff" → staff_management
- "What inventory items are low on stock" → inventory_resource
- "How many free beds / allocate an ICU bed" → inventory_resource
- "Review inventory alerts" → inventory_resource
- "Add a new patient / New Admission" → patient_management
- "Show patient PT-1043 vitals" → patient_management
- "My preferred ward is East Wing" → patient_management
- "What is my preferred ward?" → patient_management

Respond with ONLY a JSON object: {"agent": "<agent_name>", "reason": "<brief reason>"}
If the intent is unclear or out of scope, respond: {"agent": "patient_management", "reason": "default fallback"}"""


def _extract_last_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            return str(msg.content)
        if isinstance(msg, dict) and msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def _is_preference_or_memory_intent(t: str) -> bool:
    """User prefs / recall — must not hit inventory bed fast-path (BUG-MEM0-1)."""
    if re.search(r"\b(preferred|preference|prefer)\b", t):
        return True
    if re.search(
        r"\b("
        r"what (is|was) my|"
        r"do you remember|"
        r"remember (my|that|this)|"
        r"my (usual|favorite|favourite)"
        r")\b",
        t,
    ):
        return True
    return False


def _rule_based_intent(text: str) -> str | None:
    """Deterministic intent for high-confidence phrases (avoids LLM misroutes)."""
    t = text.lower().strip()
    if not t:
        return None

    # Preferences / long-term memory recall → Patient Agent (reads Mem0 + session history)
    if _is_preference_or_memory_intent(t):
        return "patient_management"

    # Staff / HR / payroll — must classify as staff_management so role-gate hard-denies
    # for nurse/doctor (ParallelContracts: never silently remap to an allowed agent).
    if re.search(r"\bpayroll\b|\bsalary\b|\bwages?\b|\bhr\b|\bhuman resources\b", t):
        return "staff_management"
    if re.search(r"\bstaff\b", t) and re.search(
        r"\b(schedule|roster|shift|attendance|payroll)\b", t
    ):
        return "staff_management"
    if re.search(r"\b(shift|roster|attendance)\b", t) and re.search(
        r"\b(staff|nurse|nursing|doctor|employee)\b", t
    ):
        return "staff_management"
    if re.search(
        r"\b(night shift|shift gap|coverage gap|who.?s on (shift|duty)|on shift|on duty)\b",
        t,
    ):
        return "staff_management"

    # Inventory / beds / rooms / theatre — require operational bed/stock context.
    # Bare "ward" alone is NOT enough (preference questions use that word).
    if re.search(
        r"\b(inventory|sku|stock|low[- ]stock|reorder|expiry|expiring)\b", t
    ):
        return "inventory_resource"
    if re.search(r"\b(bed|beds|icu|theatre|or booking|room allocation)\b", t):
        return "inventory_resource"
    if re.search(r"\bward\b", t) and re.search(
        r"\b(available|free|allocate|allocation|status|occupancy|empty|beds?)\b", t
    ):
        return "inventory_resource"
    if re.search(r"\b(free rooms?|available rooms?|allocate .+ bed)\b", t):
        return "inventory_resource"
    if "inventory alert" in t or "stock alert" in t:
        return "inventory_resource"

    # Billing / invoices → appointment_scheduling (accessible to admin/nurse/operation staff)
    if re.search(
        r"\b(invoice|billing|bill|payment|pay the bill|outstanding|overdue invoice)\b", t
    ):
        return "appointment_scheduling"

    # Admin hospital / management reports → staff_management
    if re.search(
        r"\b(hospital report|management report|overall report|admin report|generate report)\b", t
    ):
        return "staff_management"

    # Clinical — before generic "schedule" so treatment-plan phrasing stays with PA
    if re.search(r"\btreatment plan\b|\bdraft\b.*\b(plan|treatment)\b", t):
        return "patient_management"
    if re.search(
        r"\b(add|create|register|admit)\b.*\bpatient\b|"
        r"\bnew (patient|admission)\b|"
        r"\bnew admission\b",
        t,
    ):
        return "patient_management"
    if re.search(
        r"summarize.*(patient|roster)|patients today|today.?s (patient|roster|overview)",
        t,
    ):
        return "patient_management"

    # Diagnostics
    if re.search(
        r"\b(diagnostic|lab result|imaging|pathology|x-?ray|mri|ct scan|differential)\b",
        t,
    ):
        return "medical_diagnostics"

    # Appointments / queue / appointment inbox (Gmail inbound)
    if re.search(
        r"\b(appointment|schedule|calendar|queue|call next|conflict|"
        r"inbox|gmail|customer (email|message|reply))\b",
        t,
    ):
        return "appointment_scheduling"

    return None


def _mem0_block_from_state(state: AgentState) -> str:
    context = state.get("context") or {}
    block = context.get("mem0_prompt_block") or ""
    if block:
        return str(block)
    hits = context.get("mem0_hits") or []
    if hits:
        try:
            from memory.mem0_client import format_mem0_prompt_block

            return format_mem0_prompt_block(hits)
        except Exception:
            return ""
    return ""


def _classify_intent(messages: list, _user_role: str = "", mem0_block: str = "") -> str:
    """Classify intent to a specialist agent name (role gating is separate)."""
    last_user_msg = _extract_last_user_text(messages)

    ruled = _rule_based_intent(last_user_msg)
    if ruled:
        return ruled

    try:
        llm = get_chat_llm(temperature=0.0)

        system = INTENT_CLASSIFICATION_PROMPT
        if mem0_block:
            system = f"{INTENT_CLASSIFICATION_PROMPT}\n\n{mem0_block}"

        response = llm.invoke([
            SystemMessage(content=system),
            {"role": "user", "content": f"User message: {last_user_msg}"},
        ])

        content = str(response.content).strip()
        # Tolerate fenced JSON from some models
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content).strip()

        parsed = json.loads(content)
        target = parsed.get("agent", "patient_management")

        # Return the classified target even when forbidden — supervisor_node
        # hard-denies (error in state, no route). Do NOT remap to an allowed agent.
        if target in VALID_AGENTS:
            return target
        return "patient_management"

    except Exception:
        return "patient_management"


def supervisor_node(state: AgentState) -> Command:
    """
    Supervisor node: classifies intent, enforces role-gating, routes to target agent.
    Returns a LangGraph Command to transfer control to the appropriate sub-agent node.

    Autonomous mode (entry_mode == "autonomous"): skip intent classification and
    dispatch directly to the agent named in state["active_agent"] (set by the Celery
    task). Role-gating still applies.
    """
    user_role = state.get("user_role", "doctor")
    allowed = ROLE_AGENT_ACCESS.get(user_role, set())
    messages = state.get("messages", [])
    entry_mode = state.get("entry_mode", "chat")

    # Role-gating check
    if not allowed:
        error_msg = AIMessage(content=f"Access denied: role '{user_role}' is not recognised.")
        return Command(
            update={**state, "messages": messages + [error_msg], "active_agent": "supervisor"},
            goto="__end__",
        )

    # Autonomous routing branch: direct dispatch, no intent classification.
    if entry_mode == "autonomous":
        target_agent = state.get("active_agent") or "patient_management"
        if target_agent not in allowed:
            error_msg = AIMessage(
                content=f"Autonomous dispatch denied: role '{user_role}' cannot access "
                        f"{target_agent.replace('_', ' ')}."
            )
            return Command(
                update={**state, "messages": messages + [error_msg], "active_agent": "supervisor"},
                goto="__end__",
            )
        return Command(
            update={**state, "active_agent": target_agent},
            goto=target_agent,
        )

    # Chat mode: classify intent (Mem0 long-term memory informs context when present)
    mem0_block = _mem0_block_from_state(state)
    target_agent = _classify_intent(messages, user_role, mem0_block=mem0_block)

    # Final role-gate (belt and suspenders) — hard deny, never remap
    if target_agent not in allowed:
        error_msg = AIMessage(
            content=(
                f"Access denied: your role ({user_role}) cannot use the "
                f"{target_agent.replace('_', ' ').title()} agent. "
                f"Allowed agents: {', '.join(sorted(a.replace('_', ' ') for a in allowed))}."
            )
        )
        return Command(
            update={**state, "messages": messages + [error_msg], "active_agent": "supervisor"},
            goto="__end__",
        )

    return Command(
        update={**state, "active_agent": target_agent},
        goto=target_agent,
    )
