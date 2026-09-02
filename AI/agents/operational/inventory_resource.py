"""Inventory & Resource Agent — LangGraph node for stock and bed/room management."""
from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.prebuilt import create_react_agent

from config.llm import get_chat_llm
from graph.state import AgentState
from tools.audit_logging import write_audit_log
from tools.email_tool import send_email
from tools.fallback_handler import handle_agent_failure
from tools.inventory_data import get_inventory_alerts, get_inventory_items, get_rooms_status
from tools.inventory_writeback import allocate_bed
from tools.patient_data import find_patient
from tools.rag_retrieval import retrieve_clinical_context

SYSTEM_PROMPT = """You are the Inventory & Resource Agent for MediSync hospital system.

Your responsibilities:
- Inventory management: stock queries, low-stock alerts, expiry checks
- Resource management: bed/room allocation via allocate_bed, theatre booking queries
- Stock tracking and reorder notifications (send via email)
- Alert generation for critical stock levels

Role access:
- Admin: full access including allocations; stock quantity adjustments remain in Inventory UI
- Nurse: view access and bed allocation (same as Inventory → Allocate Bed UI)

Strict guidelines:
- Nurses can query and allocate beds, but cannot approve stock quantity adjustments in chat.
- Always log inventory actions via audit_logging.
- For autonomous Celery runs: daily low-stock scan, expiry check within 30 days, send alert emails.
- You HAVE allocate_bed. When the user names a patient and wants a bed (optionally ICU/ward),
  resolve the patient, pick an available room from get_rooms_status, then call allocate_bed.

Tool use:
- For "check inventory / what's low / stock for X" questions, call get_inventory_items with
  low_stock_only=True or a category filter. It reads the authoritative Postgres stock levels.
- For "expiry check / expiring soon", call get_inventory_items(expiring_within_days=30).
- For active alerts, call get_inventory_alerts(active_only=True).
- For "how many beds/rooms available / find a free room", call get_rooms_status(status='available').
- To allocate: find_patient → get_rooms_status(available) → allocate_bed(patient_id, room_id, bed_number).
- Do NOT retry a tool with a rephrased query. If a tool returns an empty list, conclude no matching
  records and proceed — do not loop.
- Keep answers concise. One tool call per concern is enough."""

TOOLS = [
    get_inventory_items,
    get_inventory_alerts,
    get_rooms_status,
    find_patient,
    allocate_bed,
    retrieve_clinical_context,
    send_email,
    write_audit_log,
    handle_agent_failure,
]

# Chat-mode tools only — avoid email/RAG loops that hang FreeLLMAPI react agents
CHAT_TOOLS = [
    get_inventory_items,
    get_inventory_alerts,
    get_rooms_status,
    find_patient,
    allocate_bed,
    handle_agent_failure,
]


def _get_llm():
    return get_chat_llm(temperature=0.0, streaming=False)


def _last_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, "type") and msg.type == "human"):
            return str(msg.content)
        if isinstance(msg, dict) and msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def _parse_tool_json(raw: str):
    try:
        return json.loads(raw)
    except Exception:
        return None


def _format_alerts(rows: list) -> str:
    if not rows:
        return "There are no active inventory alerts right now."
    lines = [f"Active inventory alerts ({len(rows)}):"]
    for row in rows[:20]:
        name = row.get("item_name") or row.get("sku") or "Unknown item"
        level = row.get("alert_type") or row.get("severity") or "alert"
        stock = row.get("current_stock")
        min_level = row.get("minimum_level")
        extra = ""
        if stock is not None and min_level is not None:
            extra = f" — stock {stock} / min {min_level}"
        lines.append(f"- {name} ({level}){extra}")
    return "\n".join(lines)


def _format_low_stock(rows: list) -> str:
    if not rows:
        return "No items are currently at or below minimum stock."
    lines = [f"Low-stock items ({len(rows)}):"]
    for row in rows[:20]:
        name = row.get("item_name") or row.get("sku") or "Unknown"
        stock = row.get("current_stock")
        min_level = row.get("minimum_level")
        unit = row.get("unit") or ""
        lines.append(f"- {name}: {stock} {unit} (min {min_level})".strip())
    return "\n".join(lines)


def _format_rooms(rows: list, *, allocate_hint: bool = True) -> str:
    if not rows:
        return "No available rooms/beds found."
    by_ward: dict[str, int] = {}
    for row in rows:
        ward = row.get("ward") or "Unknown ward"
        by_ward[ward] = by_ward.get(ward, 0) + 1
    lines = [f"Available rooms/beds: {len(rows)} total."]
    for ward, count in sorted(by_ward.items()):
        lines.append(f"- {ward}: {count}")
    samples = [
        f"{r.get('ward', '?')} {r.get('room_number', '')}".strip()
        for r in rows[:5]
    ]
    if samples:
        lines.append("Examples: " + ", ".join(samples))
    if allocate_hint:
        lines.append(
            "To allocate via chat: “Allocate an ICU bed for patient PT-1043 …” "
            "(nurse/admin). Stock quantity edits stay in Inventory UI (admin)."
        )
    return "\n".join(lines)


def _pick_free_bed(room: dict) -> int | None:
    bed_count = int(room.get("bed_count") or 1)
    occupied = {
        int(a.get("bed_number"))
        for a in (room.get("active_allocations") or [])
        if a.get("bed_number") is not None
    }
    for n in range(1, bed_count + 1):
        if n not in occupied:
            return n
    return None


def _try_allocate_bed(user_text: str) -> str | None:
    """Deterministic allocate when patient + allocate intent are present."""
    t = user_text.lower()
    if not re.search(r"\ballocate\b", t):
        return None

    code_m = re.search(r"\bPT-\d+\b", user_text, re.I)
    query = code_m.group(0) if code_m else None
    if not query:
        # "for patient Name …" or trailing name tokens
        m = re.search(
            r"(?:for\s+)?(?:patient\s+)?([A-Za-z][A-Za-z\s'.-]{1,60})$",
            user_text.strip(),
            re.I,
        )
        if m:
            query = m.group(1).strip()
        else:
            m2 = re.search(r"\b(?:patient|for)\s+([A-Za-z][\w\s'.-]{1,40})", user_text, re.I)
            query = m2.group(1).strip() if m2 else None
    if not query:
        return (
            "To allocate a bed, name the patient (e.g. PT-1043 Tan Mei Lin) and "
            "optionally the ward (ICU). Example: Allocate an ICU bed for patient PT-1043."
        )

    matches = _parse_tool_json(find_patient.invoke({"query": query}))
    if not isinstance(matches, list) or not matches:
        return f"No patient found matching '{query}'. Check the code/name and try again."
    patient = matches[0]

    raw_rooms = get_rooms_status.invoke({"status": "available"})
    rooms = _parse_tool_json(raw_rooms)
    if not isinstance(rooms, list) or not rooms:
        return "No available rooms to allocate right now."

    prefer_icu = bool(re.search(r"\bicu\b", t))
    pool = rooms
    if prefer_icu:
        icu = [r for r in rooms if "icu" in str(r.get("ward", "")).lower()]
        if icu:
            pool = icu

    chosen = None
    bed_num = None
    for room in pool:
        bed_num = _pick_free_bed(room)
        if bed_num is not None:
            chosen = room
            break
    if chosen is None:
        return "Available rooms are listed, but no free bed number could be selected."

    result = _parse_tool_json(
        allocate_bed.invoke(
            {
                "patient_id": str(patient["id"]),
                "room_id": str(chosen["id"]),
                "bed_number": bed_num,
            }
        )
    )
    if not isinstance(result, dict):
        return "Allocate bed failed (unexpected tool response)."
    if result.get("error"):
        return f"Could not allocate bed: {result['error']}"
    return (
        f"Bed allocated.\n"
        f"- Patient: {result.get('patient_name')} ({result.get('patient_code')})\n"
        f"- Ward/room: {result.get('ward')} {result.get('room_number')} · "
        f"bed {result.get('bed_number')}\n"
        f"Patient status set to admitted."
    )


def _fast_path_answer(user_text: str) -> str | None:
    """Deterministic tool answers for common nurse inventory prompts (avoids LLM hang)."""
    t = user_text.lower().strip()
    if not t:
        return None

    # Preference / memory questions must not use bed availability fast-path
    if re.search(r"\b(preferred|preference|prefer)\b", t):
        return None

    wants_alerts = bool(re.search(r"\balerts?\b|\blow[- ]stock\b|\bexpir", t))
    # Bare "ward" alone is not a bed query (e.g. "preferred ward")
    wants_beds = bool(
        re.search(r"\b(bed|beds|free room|available room|icu)\b", t)
        or (
            re.search(r"\bward\b", t)
            and re.search(
                r"\b(available|free|allocate|allocation|status|occupancy|empty|beds?)\b",
                t,
            )
        )
    )
    wants_stock = bool(re.search(r"\b(inventory|stock|sku)\b", t))
    wants_allocate = bool(re.search(r"\ballocate\b", t))

    if not (wants_alerts or wants_beds or wants_stock or wants_allocate):
        return None

    # Write path first — allocate_bed for nurse/admin (doctor never reaches IA)
    if wants_allocate:
        return _try_allocate_bed(user_text)

    parts: list[str] = []

    if wants_alerts or (wants_stock and "low" in t):
        raw = get_inventory_alerts.invoke({"active_only": True})
        data = _parse_tool_json(raw)
        if isinstance(data, list) and data:
            parts.append(_format_alerts(data))
        else:
            raw_items = get_inventory_items.invoke({"low_stock_only": True})
            items = _parse_tool_json(raw_items)
            if isinstance(items, list):
                parts.append(_format_low_stock(items))
            else:
                parts.append("Could not load inventory alerts.")

    if wants_beds:
        raw_rooms = get_rooms_status.invoke({"status": "available"})
        rooms = _parse_tool_json(raw_rooms)
        if isinstance(rooms, list):
            if re.search(r"\bicu\b", t):
                icu = [r for r in rooms if "icu" in str(r.get("ward", "")).lower()]
                parts.append(_format_rooms(icu if icu else rooms))
            else:
                parts.append(_format_rooms(rooms))
        else:
            parts.append("Could not load room availability.")

    if wants_stock and not wants_alerts and "low" not in t and not wants_beds:
        raw_items = get_inventory_items.invoke({"low_stock_only": False, "limit": 15})
        items = _parse_tool_json(raw_items)
        if isinstance(items, list):
            lines = [f"Inventory sample ({min(len(items), 15)} items):"]
            for row in items[:15]:
                lines.append(
                    f"- {row.get('item_name')}: {row.get('current_stock')} "
                    f"{row.get('unit') or ''} (min {row.get('minimum_level')})".strip()
                )
            parts.append("\n".join(lines))

    return "\n\n".join(parts) if parts else None


def inventory_resource_node(state: AgentState) -> AgentState:
    """
    LangGraph node: Inventory & Resource Agent.
    Role access: Admin (full), Nurse (view + request).
    Also invoked from Celery for daily stock/expiry scans.
    Allowed tools: rag_retrieval (T2), email_tool (T4), audit_logging (T1), fallback_handler (T7).
    """
    try:
        messages = list(state.get("messages", []))
        entry_mode = state.get("entry_mode", "chat")
        user_role = state.get("user_role", "nurse")

        if entry_mode != "autonomous":
            fast = _fast_path_answer(_last_user_text(messages))
            if fast:
                messages.append(AIMessage(content=fast))
                return {
                    **state,
                    "messages": messages,
                    "active_agent": "inventory_resource",
                }

        llm = _get_llm()
        role_instruction = ""
        if user_role == "nurse":
            role_instruction = (
                "\nUser is a Nurse: you may allocate beds with allocate_bed. "
                "Do not perform stock quantity adjustments — use Inventory UI (admin)."
            )

        tools = TOOLS if entry_mode == "autonomous" else CHAT_TOOLS
        agent_executor = create_react_agent(
            llm, tools, prompt=SYSTEM_PROMPT + role_instruction
        )

        if entry_mode == "autonomous":
            from langchain_core.messages import SystemMessage
            messages = [
                SystemMessage(
                    content=(
                        "Autonomous run: check low-stock items, expiring items "
                        "within 30 days, and send alert emails to admin."
                    )
                )
            ]

        result = agent_executor.invoke(
            {"messages": messages},
            config={"recursion_limit": 8},
        )
        new_messages = result.get("messages", messages)

        return {**state, "messages": new_messages, "active_agent": "inventory_resource"}

    except Exception as exc:
        from tools.fallback_handler import agent_fallback_message
        friendly = agent_fallback_message("inventory_resource", exc)
        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=friendly))
        return {**state, "messages": messages, "active_agent": "inventory_resource"}
