"""Staff Management Agent — LangGraph node for HR and scheduling queries."""
from __future__ import annotations

import json
import re
from datetime import date, timedelta

from langchain_core.messages import AIMessage
from langgraph.prebuilt import create_react_agent

from config.llm import get_chat_llm
from graph.state import AgentState
from tools.audit_logging import write_audit_log
from tools.email_tool import send_email, send_gmail
from tools.fallback_handler import handle_agent_failure
from tools.staff_data import get_attendance, get_shift_schedules, list_staff
from tools.stripe_payroll import (
    list_payroll_records,
    process_all_draft_payroll,
    process_stripe_payroll,
)
from tools.admin_report import generate_hospital_report

SYSTEM_PROMPT = """You are the Staff Management Agent for MediSync hospital system.

Your responsibilities (Admin role only):
- Shift scheduling and conflict detection
- Attendance queries and summaries
- Payroll lookup and Stripe-backed payroll processing
- Staff reports and analytics
- HR alerts: shift gaps, overtime, leave management
- Email staff via send_email / send_gmail when asked
- Generate hospital-wide management reports (patient, appointment, inventory, staff, billing overview)

Strict guidelines:
- Only Admin users can access staff management functions.
- Never expose individual salary details beyond what is requested by Admin.
- Log all payroll actions via audit_logging.
- For Stripe payroll writes always pass user_role='admin'.
- For autonomous Celery runs: weekly shift gap scan, payroll trigger for end-of-month, send shift reminders.

Tool use:
- For "who is on duty today / on <date>" or shift-gap scans, call get_shift_schedules(day). It reads
  published shifts from Postgres.
- For "who clocked in / attendance / overtime" questions, call get_attendance(day).
- For "list doctors/nurses/staff" or to resolve a name to a staff_id, call list_staff(role).
- For payroll summary: call list_payroll_records(status?, pay_month?, pay_year?).
- To pay / process payroll via Stripe: call process_stripe_payroll(payroll_id, user_role='admin')
  or process_all_draft_payroll(user_role='admin', pay_month?, pay_year?).
- Do NOT retry a tool with a rephrased query. If a tool returns an empty list, conclude no matching
  records and proceed — do not loop."""

TOOLS = [
    list_staff,
    get_shift_schedules,
    get_attendance,
    list_payroll_records,
    process_stripe_payroll,
    process_all_draft_payroll,
    send_email,
    send_gmail,
    write_audit_log,
    handle_agent_failure,
    generate_hospital_report,
]


def _get_llm():
    return get_chat_llm(temperature=0.0, streaming=True)


def _last_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if getattr(msg, "type", None) == "human" or msg.__class__.__name__ == "HumanMessage":
            content = getattr(msg, "content", "")
            return content if isinstance(content, str) else str(content)
    return ""


def _parse_tool_json(raw: str):
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


def _fast_path_answer(user_text: str) -> str | None:
    """Deterministic answers for common Admin staff prompts (avoids FreeLLM hang / tool crashes)."""
    t = user_text.lower().strip()
    if not t:
        return None

    wants_gap = bool(
        re.search(r"\b(gap|coverage|night shift|understaff|missing shift)\b", t)
    )
    wants_on_shift = bool(
        re.search(r"\b(who.?s on|on (shift|duty)|today.?s (staff )?schedule|roster)\b", t)
    )
    wants_payroll = bool(re.search(r"\bpayroll\b|\bsalary\b", t))
    wants_pay_now = bool(
        re.search(r"\b(process|pay|run|execute|stripe)\b", t) and wants_payroll
    )

    if not (wants_gap or wants_on_shift or wants_payroll):
        return None

    if wants_payroll:
        if wants_pay_now:
            raw_pay = process_all_draft_payroll.invoke({
                "user_role": "admin",
                "limit": 10,
            })
            return (
                "Stripe payroll batch result:\n"
                f"{raw_pay}\n\n"
                "You can also use Staff → Payroll → Process for a single row."
            )
        raw_list = list_payroll_records.invoke({"limit": 20})
        return (
            "Payroll records (from Postgres):\n"
            f"{raw_list}\n\n"
            "To pay via Stripe, ask to process/pay payroll, or use Staff → Payroll → Process."
        )

    # Scan this week for night coverage + conflicts (one query via tools per day is heavy;
    # use today's tool for on-duty; for gap scan iterate with short-circuit).
    if wants_gap:
        from db.postgres import apg_connect
        import asyncio

        async def _week_scan() -> str:
            today = date.today()
            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)
            conn = await apg_connect()
            try:
                rows = await conn.fetch(
                    """
                    SELECT ss.shift_date, ss.shift_type, ss.location, ss.conflict_flagged,
                           s.full_name AS staff_name
                    FROM shift_schedules ss
                    JOIN staff s ON s.id = ss.staff_id
                    WHERE ss.is_published = true
                      AND ss.shift_date BETWEEN $1::date AND $2::date
                    ORDER BY ss.shift_date, ss.start_time
                    """,
                    monday,
                    sunday,
                )
            finally:
                await conn.close()

            by_day: dict[str, list] = {}
            for r in rows:
                key = r["shift_date"].isoformat()
                by_day.setdefault(key, []).append(r)

            lines = ["Night / coverage scan (published shifts this week):"]
            conflict_lines: list[str] = []
            for offset in range(7):
                day = (monday + timedelta(days=offset)).isoformat()
                day_rows = by_day.get(day, [])
                nights = [r for r in day_rows if str(r["shift_type"]).lower() == "night"]
                if nights:
                    lines.append(
                        f"- {day}: "
                        + ", ".join(
                            f"{r['staff_name']} ({r['location'] or '—'})" for r in nights
                        )
                    )
                else:
                    lines.append(f"- {day}: NO night shift published")
                for r in day_rows:
                    if r["conflict_flagged"]:
                        loc = f" · {r['location']}" if r["location"] else ""
                        conflict_lines.append(
                            f"- {day} {r['staff_name']} ({r['shift_type']}{loc})"
                        )
            if conflict_lines:
                lines.append("\nFlagged conflicts:")
                lines.extend(conflict_lines)
            else:
                lines.append(
                    "\nNo conflict_flagged shifts in this week's published roster."
                )
            return "\n".join(lines)

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(_week_scan())
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, _week_scan()).result(timeout=20)

    # Who is on shift today
    raw = get_shift_schedules.invoke({"day": date.today().isoformat()})
    rows = _parse_tool_json(raw)
    if not isinstance(rows, list):
        return "Could not load today's shift schedules."
    if not rows:
        return f"No published shifts for {date.today().isoformat()}."
    lines = [f"On shift today ({date.today().isoformat()}):"]
    for r in rows:
        loc = f" · {r.get('location')}" if r.get("location") else ""
        flag = " · CONFLICT" if r.get("conflict_flagged") else ""
        lines.append(
            f"- {r.get('staff_name')} · {r.get('shift_type')} "
            f"{r.get('start_time')}-{r.get('end_time')}{loc}{flag}"
        )
    return "\n".join(lines)


def staff_management_node(state: AgentState) -> AgentState:
    """
    LangGraph node: Staff Management Agent.
    Role access: Admin only (enforced by supervisor before routing here).
    Also invoked from Celery for weekly shift and payroll tasks.
    Allowed tools: email_tool (T4), audit_logging (T1), fallback_handler (T7).
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
                    "active_agent": "staff_management",
                }

        llm = _get_llm()
        agent_executor = create_react_agent(llm, TOOLS, prompt=SYSTEM_PROMPT)

        if entry_mode == "autonomous":
            from langchain_core.messages import SystemMessage
            messages = [SystemMessage(content="Autonomous run: scan for shift gaps next week, check if payroll processing is due, and send shift schedule reminders to staff.")]

        result = agent_executor.invoke(
            {"messages": messages}, config={"recursion_limit": 8}
        )
        new_messages = result.get("messages", messages)

        return {**state, "messages": new_messages, "active_agent": "staff_management"}

    except Exception as exc:
        from tools.fallback_handler import agent_fallback_message
        friendly = agent_fallback_message("staff_management", exc)
        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=friendly))
        return {**state, "messages": messages, "active_agent": "staff_management"}
