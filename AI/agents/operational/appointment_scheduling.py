"""Appointment Scheduling Agent — LangGraph node for appointment management."""
from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage
from langgraph.prebuilt import create_react_agent

from config.llm import get_chat_llm
from graph.state import AgentState
from tools.appointment_data import (
    get_appointment_conflicts,
    get_appointments,
    get_staff_availability,
)
from tools.appointment_writeback import (
    cancel_appointment,
    create_appointment,
    update_appointment,
)
from tools.audit_logging import write_audit_log
from tools.calendar_tool import (
    check_appointment_conflicts,
    create_calendar_event,
    delete_calendar_event,
    list_calendar_events,
)
from tools.email_tool import (
    get_inbox_message,
    list_inbox_messages,
    send_email,
    send_gmail,
)
from tools.fallback_handler import handle_agent_failure
from tools.staff_data import list_staff
from tools.billing_data import get_patient_invoices, get_invoice_summary
from tools.billing_writeback import create_invoice, update_invoice_status

SYSTEM_PROMPT = """You are the Appointment Scheduling Agent for MediSync hospital system.

Your responsibilities (Admin / Operation staff role):
- Schedule appointments and check for conflicts
- Queue management: ordering, prioritisation
- Reminder generation and email notifications (Gmail when OAuth configured, else Resend)
- Read inbound patient/customer appointment emails from Gmail inbox
- Google Calendar sync for confirmed appointments (list / create / conflict check)
- Patient billing: create invoices, view invoice status, mark as paid/sent/cancelled

Strict guidelines:
- Only Admin users can invoke scheduling actions that modify appointments.
- Always check for conflicts before creating appointments.
- Send confirmation emails after successful bookings.
- Log all scheduling actions via audit_logging.
- For autonomous Celery runs: scan for conflicts nightly, send reminder emails 24h before appointments.

Tool use:
- To read the schedule, call get_appointments(staff_id?, patient_id?, days_ahead). To find a free slot
  that respects a doctor's working hours, call get_staff_availability(staff_id, day) — it returns the
  doctor's shift window and existing appointments; pick a gap inside the shift. For the nightly conflict
  scan, call get_appointment_conflicts() ONCE.
- To notify a patient: call send_email or send_gmail with appointment details (patient, time, visit type).
  Prefer the patient's email from get_appointments; if missing, use the address the admin provides.
- To read customer replies: call list_inbox_messages(query?) then get_inbox_message(message_id) for the
  full body. Default query already targets appointment/booking/reschedule/cancel mail.
- When a patient email requests a booking, reschedule, or cancellation: parse the intent (who, when,
  visit type), read the doctor's availability, then call create_appointment / update_appointment /
  cancel_appointment. These run conflict detection and write an audit row.
- After a successful create/confirm, send a confirmation email via send_email or send_gmail and
  sync to Google Calendar via create_calendar_event. Use list_calendar_events to show the agenda.
- Do NOT retry a tool with a rephrased query hoping for different results. If a tool returns an empty
  list, conclude no matching records exist and proceed — do not loop. After acting, write a short
  summary and stop.

Booking workflow (patient email → appointment): do these steps, each tool once, then stop:
1. list_inbox_messages / get_inbox_message if you need the inbound mail text.
2. If the email refers to the doctor by name (not staff_id), call list_staff() ONCE (no role filter) and
   match by full_name to resolve a staff_id. Then use that staff_id for every subsequent call.
3. get_staff_availability(staff_id, day) to see the doctor's shift and existing appointments.
4. Pick a free slot inside the shift (or any non-conflicting slot if no shift is published).
5. create_appointment(...) — one call.
6. send_email(to, subject, body) — one confirmation email.
7. create_calendar_event(...) when Google is configured.
8. write_audit_log(...) — one audit entry.
9. Reply with a one-line confirmation (appointment id, time) and stop. Do not re-query after this."""

TOOLS = [
    list_staff,
    get_appointments,
    get_staff_availability,
    get_appointment_conflicts,
    create_appointment,
    update_appointment,
    cancel_appointment,
    check_appointment_conflicts,
    create_calendar_event,
    list_calendar_events,
    delete_calendar_event,
    send_email,
    send_gmail,
    list_inbox_messages,
    get_inbox_message,
    write_audit_log,
    handle_agent_failure,
    # Billing
    get_patient_invoices,
    get_invoice_summary,
    create_invoice,
    update_invoice_status,
]


def _get_llm():
    return get_chat_llm(temperature=0.0, streaming=True)


def _last_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if getattr(msg, "type", None) == "human" or msg.__class__.__name__ == "HumanMessage":
            content = getattr(msg, "content", "")
            return content if isinstance(content, str) else str(content)
    return ""


def _parse_tool_json(raw):
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


def _test_to_address() -> str:
    from config.settings import settings
    import os

    return (
        (getattr(settings, "google_test_to", "") or "").strip()
        or os.environ.get("GOOGLE_TEST_TO", "").strip()
    )


def _fast_path_send_notification(user_text: str) -> str | None:
    """Send a LIVE appointment confirmation/reminder email (deterministic)."""
    t = user_text.lower().strip()
    # Explicit send/notify + appointment context (not inbox-read prompts)
    if not re.search(r"\b(appointment|booking|visit)\b", t):
        return None
    if not re.search(r"\b(send|notify|mail)\b", t) and not re.search(
        r"\bemail (a |the |an )?(appointment|confirmation|reminder|notification)\b", t
    ):
        return None
    if re.search(
        r"\b(inbox|list (my |the )?emails?|read (the )?(inbox|email)|"
        r"customer (email|message|reply)|patient (email|reply))\b",
        t,
    ):
        return None

    raw = get_appointments.invoke({"days_ahead": 14})
    rows = _parse_tool_json(raw)
    if not isinstance(rows, list) or not rows:
        # Still allow a smoke notification with placeholder details
        appt = {
            "id": "demo",
            "patient_name": "Demo Patient",
            "staff_name": "Clinic Staff",
            "visit_type": "consultation",
            "start_time": "(see clinic schedule)",
            "end_time": "",
            "patient_email": None,
            "room_number": None,
        }
    else:
        appt = rows[0]

    to_addr = (appt.get("patient_email") or "").strip() or _test_to_address()
    if not to_addr:
        return (
            "Could not send appointment email: no patient email on the appointment "
            "and GOOGLE_TEST_TO is unset."
        )

    is_reminder = bool(re.search(r"\bremind", t))
    kind = "reminder" if is_reminder else "confirmation"
    subject = f"MediSync appointment {kind}: {appt.get('visit_type') or 'visit'}"
    room = appt.get("room_number") or "—"
    body = (
        f"Hello {appt.get('patient_name') or 'Patient'},\n\n"
        f"This is your appointment {kind} from MediSync.\n\n"
        f"Patient: {appt.get('patient_name') or '—'}\n"
        f"Clinician: {appt.get('staff_name') or '—'}\n"
        f"Visit type: {appt.get('visit_type') or '—'}\n"
        f"Start: {appt.get('start_time') or '—'}\n"
        f"End: {appt.get('end_time') or '—'}\n"
        f"Room: {room}\n"
        f"Appointment id: {appt.get('id') or '—'}\n\n"
        "If you need to reschedule or cancel, reply to this email or contact the clinic.\n"
    )
    result_raw = send_email.invoke({"to": to_addr, "subject": subject, "body": body})
    result = _parse_tool_json(result_raw) or {}
    status = result.get("status", "unknown")
    provider = result.get("provider", "")
    msg_id = result.get("id") or ""
    if status == "sent":
        return (
            f"Appointment {kind} email sent via {provider or 'email'}.\n"
            f"- To: {to_addr}\n"
            f"- Subject: {subject}\n"
            f"- Patient: {appt.get('patient_name')} · {appt.get('start_time')}\n"
            f"- Message id: {msg_id or '—'}"
        )
    if status == "skipped":
        return f"Appointment email skipped: {result.get('reason', 'provider not configured')}."
    return f"Appointment email failed: {result.get('error') or result_raw}"


def _fast_path_inbox(user_text: str) -> str | None:
    """List / read Gmail inbox messages related to appointments."""
    t = user_text.lower().strip()
    wants_inbox = bool(
        re.search(
            r"\b(inbox|customer (email|message|reply)|patient (email|reply)|"
            r"list (my |the )?(emails?|messages)|read (the )?(inbox|email|messages?)|"
            r"check (the )?(inbox|email)|gmail (inbox|messages?))\b",
            t,
        )
    )
    if not wants_inbox:
        return None

    # Prefer MediSync / appointment-flavoured query; "all/recent inbox" → broader
    query = (
        "MediSync OR subject:appointment OR "
        "(appointment AND (booking OR reschedule OR cancel OR confirmation OR reminder))"
    )
    if re.search(r"\b(all|recent)\b.*\binbox\b|\binbox\b.*\b(all|recent)\b", t):
        query = "in:inbox"

    listed_raw = list_inbox_messages.invoke({"query": query, "max_results": 8})
    listed = _parse_tool_json(listed_raw) or {}
    if listed.get("status") == "error":
        return f"Could not read Gmail inbox: {listed.get('error')}"
    if listed.get("status") == "skipped":
        return f"Gmail inbox unavailable: {listed.get('reason')}"

    messages = listed.get("messages") or []
    if not messages:
        return (
            f"No inbox messages matched query `{listed.get('query') or query}`.\n"
            "Try asking to list recent inbox mail, or send a test appointment email first."
        )

    wants_full = bool(re.search(r"\b(read|open|full|body|detail)\b", t))
    lines = [
        f"Appointment-related inbox ({listed.get('count', len(messages))} message(s)) "
        f"[query: {listed.get('query') or query}]:"
    ]
    for msg in messages[:8]:
        lines.append(
            f"- {msg.get('date') or '—'} · {msg.get('from') or '—'} · "
            f"{msg.get('subject') or '(no subject)'}\n"
            f"  snippet: {msg.get('snippet') or '—'}\n"
            f"  id: {msg.get('id')}"
        )

    if wants_full and messages:
        first_id = messages[0].get("id")
        if first_id:
            full_raw = get_inbox_message.invoke({"message_id": first_id})
            full = _parse_tool_json(full_raw) or {}
            if full.get("status") == "ok":
                body = (full.get("body") or "").strip() or "(empty body)"
                if len(body) > 1200:
                    body = body[:1200] + "\n…[truncated]"
                lines.append(
                    f"\nFull body of latest message ({first_id}):\n"
                    f"From: {full.get('from')}\n"
                    f"Subject: {full.get('subject')}\n"
                    f"{body}"
                )
            else:
                lines.append(
                    f"\nCould not load full body for {first_id}: "
                    f"{full.get('error') or full_raw}"
                )

    return "\n".join(lines)


def _fast_path_answer(user_text: str) -> str | None:
    """Deterministic AA answers for email notify / inbox / conflict probes."""
    t = user_text.lower().strip()
    if not t:
        return None

    inbox = _fast_path_inbox(user_text)
    if inbox:
        return inbox

    notify = _fast_path_send_notification(user_text)
    if notify:
        return notify

    wants_conflicts = bool(
        re.search(r"\b(conflicts?|double[- ]book|overlapping)\b", t)
    )
    wants_reschedule = bool(re.search(r"\breschedul", t))
    if not (wants_conflicts or wants_reschedule):
        return None

    raw = get_appointment_conflicts.invoke({})
    rows = _parse_tool_json(raw)
    if not isinstance(rows, list):
        return "Could not load appointment conflicts."

    if not rows:
        base = "No upcoming appointments are currently flagged with conflict_detected."
    else:
        lines = [f"Appointment conflicts ({len(rows)} flagged):"]
        for row in rows[:12]:
            lines.append(
                f"- {row.get('staff_name')} · {row.get('patient_name')} · "
                f"{row.get('visit_type')} · {row.get('start_time')}–{row.get('end_time')}"
            )
        if len(rows) > 12:
            lines.append(f"…and {len(rows) - 12} more.")
        base = "\n".join(lines)

    if wants_reschedule:
        return (
            f"{base}\n\n"
            "To reschedule: use Appointments → New appointment / edit the slot after "
            "running Check Conflicts, or ask with patient + preferred new time."
        )
    return base


def _build_messages(state: AgentState):
    """Build the message list, honoring the autonomous task payload when present.

    The system prompt is injected via create_react_agent(prompt=...), so the autonomous
    task is passed as a HumanMessage — the natural input shape for a ReAct tool-caller
    (system-only inputs tend to loop without converging).
    """
    messages = state.get("messages", [])
    entry_mode = state.get("entry_mode", "chat")
    if entry_mode == "autonomous":
        from langchain_core.messages import HumanMessage

        task = state.get("task") or "Autonomous run: perform nightly conflict scan and send reminders for tomorrow's appointments."
        messages = [HumanMessage(content=task)]
    return messages


def appointment_scheduling_node(state: AgentState) -> AgentState:
    """
    LangGraph node: Appointment Scheduling Agent.
    Role access: Admin only (enforced by supervisor).
    Also invoked directly from Celery tasks (entry_mode="autonomous").
    Allowed tools: appointment_data + appointment_writeback + calendar_tool + email_tool
    + audit_logging + fallback_handler.
    """
    try:
        messages = list(state.get("messages", []))
        entry_mode = state.get("entry_mode", "chat")

        if entry_mode != "autonomous":
            fast = _fast_path_answer(_last_user_text(messages))
            if fast:
                messages.append(AIMessage(content=fast))
                return {
                    **state,
                    "messages": messages,
                    "active_agent": "appointment_scheduling",
                }

        llm = _get_llm()
        agent_executor = create_react_agent(llm, TOOLS, prompt=SYSTEM_PROMPT)

        messages = _build_messages(state)
        result = agent_executor.invoke(
            {"messages": messages}, config={"recursion_limit": 8}
        )
        new_messages = result.get("messages", messages)

        return {**state, "messages": new_messages, "active_agent": "appointment_scheduling"}

    except Exception as exc:
        from tools.fallback_handler import agent_fallback_message
        friendly = agent_fallback_message("appointment_scheduling", exc)
        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=friendly))
        return {**state, "messages": messages, "active_agent": "appointment_scheduling"}
