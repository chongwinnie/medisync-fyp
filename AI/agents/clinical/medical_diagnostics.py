"""Medical Diagnostics Agent — LangGraph node for diagnostic support queries."""
from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from config.llm import get_chat_llm
from graph.state import AgentState
from tools.audit_logging import write_audit_log
from tools.clinical_data import get_patient_clinical_summary, get_pending_diagnostic_reports
from tools.clinical_writeback import update_diagnostic_report_ai_draft
from tools.document_parsing import parse_medical_document
from tools.fallback_handler import handle_agent_failure
from tools.image_analysis import analyze_medical_image
from tools.rag_retrieval import retrieve_clinical_context

SYSTEM_PROMPT = """You are the Medical Diagnostics Agent for MediSync hospital system.

Your responsibilities:
- Medical report drafting (mark as AI-assisted, requires clinician finalization)
- Medical image interpretation assistance (X-ray, MRI, CT, ultrasound, pathology)
- Summarisation of diagnostic findings
- Diagnostic support for clinician review

Role access: Doctor, Nurse, Admin

Strict guidelines:
- NEVER provide a definitive diagnosis. You provide AI-assisted analysis for clinician review only.
- All image interpretations must include: "AI-assisted analysis. Not a clinical diagnosis. Clinician review required."
- All reports must be marked as drafts until finalized by a clinician.
- Always log significant diagnostic actions via the audit_logging tool.

Tool use:
- For "review pending diagnostic reports" or any task needing the exact set of reports awaiting
  review, call get_pending_diagnostic_reports ONCE. It reads the authoritative Postgres record set.
- Use get_patient_clinical_summary(patient_id) to pull full context (conditions, medications, vitals,
  labs, prior reports) for a specific patient from Postgres.
- Use retrieve_clinical_context (Chroma semantic search) only for "find similar/related" knowledge
  queries, NOT for status-filtered lookups.
- Do NOT retry a tool with a rephrased query hoping for different results. If a tool returns an empty
  list, conclude that no matching records exist and proceed to your summary — do not loop.
- After analysing a report, PERSIST your AI-assisted summary by calling
  update_diagnostic_report_ai_draft(report_id, ai_summary, ai_confidence) for each report you reviewed.
  This writes ONLY the AI fields (ai_summary, ai_confidence, ai_assisted); it never finalizes a report
  or changes its status. Do NOT attempt to set status to 'finalized' — finalization is clinician-only.
- After gathering data and writing back drafts, write your summary and call write_audit_log once, then stop.

You share patient_context with the Patient Management Agent via state["context"]["patient_context"].
Read patient conditions and active medications from patient_context.
Write your latest_findings to patient_context so Patient Agent can incorporate them."""

TOOLS = [
    get_pending_diagnostic_reports,
    get_patient_clinical_summary,
    update_diagnostic_report_ai_draft,
    retrieve_clinical_context,
    analyze_medical_image,
    parse_medical_document,
    write_audit_log,
    handle_agent_failure,
]

CHAT_TOOLS = [
    get_pending_diagnostic_reports,
    get_patient_clinical_summary,
    update_diagnostic_report_ai_draft,
    write_audit_log,
    handle_agent_failure,
]


def _get_llm():
    return get_chat_llm(temperature=0.1, streaming=True)


def _last_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            return str(msg.content)
        if isinstance(msg, HumanMessage):
            return str(msg.content)
        if isinstance(msg, dict) and msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def _parse_tool_json(raw: str):
    try:
        return json.loads(raw)
    except Exception:
        return None


def _fast_path_answer(user_text: str) -> str | None:
    """Deterministic answers for common Diagnose Agent prompts (avoids LLM hang)."""
    t = user_text.lower().strip()
    if not t:
        return None

    wants_pending = bool(
        re.search(
            r"summarize.*(diagnostic|report)|pending.*(diagnostic|report)|"
            r"review.*(diagnostic|report)|diagnostic.*(summary|summarize)",
            t,
        )
    )
    wants_differential = bool(
        re.search(r"\bdifferential\b|\bdifferential diagnosis\b", t)
    )
    if not (wants_pending or wants_differential):
        return None

    raw = get_pending_diagnostic_reports.invoke({})
    reports = _parse_tool_json(raw)
    if not isinstance(reports, list):
        return "Could not load pending diagnostic reports."
    if not reports:
        if wants_differential:
            return (
                "No pending diagnostic reports to ground a differential. "
                "AI-assisted analysis. Not a clinical diagnosis. Clinician review required.\n"
                "Open a patient chart → Diagnostics, or ask with a specific patient code."
            )
        return "No diagnostic reports are currently pending review."

    if wants_differential:
        lines = [
            "DRAFT differential framing from pending diagnostics "
            "(AI-assisted analysis. Not a clinical diagnosis. Clinician review required.):",
            "",
        ]
        for report in reports[:6]:
            title = report.get("title") or report.get("report_type") or "Untitled"
            patient = report.get("patient_name") or "Unknown patient"
            findings = (
                report.get("findings") or report.get("ai_summary") or "No findings text."
            )[:220]
            lines.append(f"- Consider workup related to {title} for {patient}: {findings}")
        lines.append(
            "\nNext: clinician confirms/rejects differentials; use Diagnostics → View Report."
        )
        return "\n".join(lines)

    lines = [
        f"Pending diagnostic reports ({len(reports)}) — AI-assisted overview for clinician review:",
        "AI-assisted analysis. Not a clinical diagnosis. Clinician review required.",
        "",
    ]
    for report in reports[:12]:
        title = report.get("title") or report.get("report_type") or "Untitled"
        patient = report.get("patient_name") or "Unknown patient"
        code = report.get("patient_code") or ""
        status = report.get("status") or "pending"
        findings = (report.get("findings") or report.get("ai_summary") or "No findings text.")[
            :180
        ]
        lines.append(
            f"- {title} · {patient} ({code}) · {status}\n  {findings}"
        )
    if len(reports) > 12:
        lines.append(f"…and {len(reports) - 12} more.")
    lines.append(
        "\nOpen Diagnostics → View Report to review each chart entry in full."
    )
    return "\n".join(lines)


def _build_messages(state: AgentState, context_hint: str) -> list:
    """Build the message list for the agent.

    Chat mode: use state messages. Autonomous mode: synthesize a single system
    message from the task payload (no user message).
    """
    messages = state.get("messages", [])
    if state.get("entry_mode") == "autonomous":
        task = state.get("task") or "Autonomous run: perform your assigned diagnostic review task."
        return [SystemMessage(content=f"{task}{context_hint}")]
    return messages


def medical_diagnostics_node(state: AgentState) -> AgentState:
    """
    LangGraph node: Medical Diagnostics Agent.

    Reads patient_context from state for shared PA<->Diagnose Agent context.
    Writes latest_findings back to patient_context after analysis.
    Allowed tools: rag_retrieval (T2), image_analysis (T6), document_parsing (T5),
                   audit_logging (T1), fallback_handler (T7).
    """
    try:
        messages = list(state.get("messages", []))
        entry_mode = state.get("entry_mode", "chat")
        context = state.get("context", {})
        patient_context = context.get("patient_context", {})

        if entry_mode != "autonomous":
            fast = _fast_path_answer(_last_user_text(messages))
            if fast:
                messages.append(AIMessage(content=fast))
                return {
                    **state,
                    "messages": messages,
                    "active_agent": "medical_diagnostics",
                }

        llm = _get_llm()
        tools = TOOLS if entry_mode == "autonomous" else CHAT_TOOLS
        agent_executor = create_react_agent(llm, tools, prompt=SYSTEM_PROMPT)

        context_hint = ""
        if patient_context:
            context_hint = (
                f"\n[Patient context from Patient Management: "
                f"{json.dumps(patient_context)[:500]}]"
            )
        mem0_block = context.get("mem0_prompt_block") or ""
        if mem0_block:
            context_hint = f"{context_hint}\n{mem0_block}"
        patient_id = patient_context.get("patient_id")
        if patient_id and state.get("user_id"):
            try:
                import asyncio
                from memory.mem0_client import search_memory, format_mem0_prompt_block

                last_user = _last_user_text(messages)
                scoped = asyncio.run(
                    search_memory(
                        state["user_id"],
                        last_user or "diagnostic context",
                        agent_id="medical_diagnostics",
                        patient_id=str(patient_id),
                        user_role=state.get("user_role"),
                    )
                )
                scoped_block = format_mem0_prompt_block(scoped)
                if scoped_block:
                    context_hint = f"{context_hint}\n{scoped_block}"
            except Exception:
                pass

        invoke_messages = _build_messages(state, context_hint)
        result = agent_executor.invoke(
            {"messages": invoke_messages, "extra_instructions": context_hint},
            config={"recursion_limit": 8},
        )

        new_messages = result.get("messages", invoke_messages)

        updated_context = dict(context)
        patient_ctx = dict(patient_context)
        patient_ctx["latest_findings_agent"] = "medical_diagnostics"
        updated_context["patient_context"] = patient_ctx

        return {
            **state,
            "messages": new_messages,
            "active_agent": "medical_diagnostics",
            "context": updated_context,
        }

    except Exception as exc:
        from tools.fallback_handler import agent_fallback_message

        friendly = agent_fallback_message("medical_diagnostics", exc)
        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=friendly))
        return {**state, "messages": messages, "active_agent": "medical_diagnostics"}
