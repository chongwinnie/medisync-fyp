"""Patient Management Agent — LangGraph node for patient-related clinical queries."""
from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from config.llm import get_chat_llm
from graph.state import AgentState
from tools.audit_logging import write_audit_log
from tools.clinical_data import get_patient_clinical_summary
from tools.clinical_writeback import update_treatment_plan_ai_draft
from tools.document_parsing import parse_medical_document
from tools.fallback_handler import handle_agent_failure
from tools.patient_data import find_patient, get_today_overview, list_patients
from tools.patient_writeback import create_patient, update_patient
from tools.rag_retrieval import retrieve_clinical_context

SYSTEM_PROMPT = """You are the Patient Management Agent for MediSync hospital system.

Your responsibilities:
- Patient profile retrieval and summary
- Create / admit new patients (New Admission) via create_patient when the user provides details
- Update basic demographics via update_patient (doctor/admin only)
- Medicine management: list, review, and flag interactions
- Treatment plan drafting (mark clearly as AI-assisted draft for clinician review)
- Case history lookup and summarisation

Role access: Doctor, Nurse, Admin

Strict guidelines:
- NEVER fabricate patient data. If data is unavailable, say so clearly.
- All treatment plan drafts must include: "DRAFT — AI-assisted. Requires clinician review and approval."
- Maintain patient privacy; do not expose data beyond what's necessary.
- Always log significant actions via the audit_logging tool.
- When drafting a treatment plan, PERSIST it by calling update_treatment_plan_ai_draft(plan_id,
  ai_draft_content). This writes ONLY the AI fields (ai_draft_content, ai_assisted); it never changes
  plan status, objectives, or reviewed_by. Do NOT set status to 'active'/'completed' — approval is
  clinician-only.
- Do NOT retry a tool with a rephrased query hoping for different results. If a tool returns an empty
  list, conclude no matching records exist and proceed — do not loop.
- You HAVE create_patient. Never say you lack a tool to create patients. If required fields are
  missing, ask once for: full name, date of birth (YYYY-MM-DD), gender; optional blood type, phone,
  and whether this is an admission. Then call create_patient.

Tool use:
- For "how many patients today / today's overview / dashboard" questions, call get_today_overview ONCE.
  It returns aggregate counts (appointments today, patients by status, queue, pending reports,
  low-stock) directly from Postgres.
- For "list / which / how many patients" questions (no specific patient named), call list_patients with
  an optional status filter. Do NOT guess a patient_id.
- When the user refers to a patient by name (not UUID), call find_patient(name) to resolve a
  patient_id, THEN call get_patient_clinical_summary(patient_id) for the full record.
- To add / create / admit a patient once you have name + DOB + gender, call create_patient(...).
  Set as_admission=true for New Admission / "admit today" phrasing.
- Use retrieve_clinical_context (Chroma semantic search) only for "find similar/related case
  knowledge" queries, NOT for exact counts or lists.

You share patient_context with the Medical Diagnostics Agent via state["context"]["patient_context"].
When you retrieve or update patient info, write it to patient_context so Diagnose Agent can access it."""

TOOLS = [
    get_today_overview,
    list_patients,
    find_patient,
    get_patient_clinical_summary,
    create_patient,
    update_patient,
    update_treatment_plan_ai_draft,
    retrieve_clinical_context,
    parse_medical_document,
    write_audit_log,
    handle_agent_failure,
]

# Chat path: skip slow RAG / document tools that commonly exceed the SSE timeout
CHAT_TOOLS = [
    get_today_overview,
    list_patients,
    find_patient,
    get_patient_clinical_summary,
    create_patient,
    update_patient,
    update_treatment_plan_ai_draft,
    write_audit_log,
    handle_agent_failure,
]

_CREATE_PROMPT_MARKER = "I can create the patient record now"
_CREATE_ASK = (
    f"{_CREATE_PROMPT_MARKER}.\n"
    "Please send: full name, date of birth (YYYY-MM-DD or YYYY.MM.DD), gender "
    "(male/female/other/unknown). Optional: blood type, phone, patient code (PT-####), "
    "and whether this is an admission (yes/no).\n"
    "Example: Fanny Tan, 2000.01.06, female, A+, admission yes"
)


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


def _wants_create_patient(text: str) -> bool:
    t = text.lower().strip()
    return bool(
        re.search(
            r"\b(add|create|register|admit)\b.*\bpatient\b|"
            r"\bnew (patient|admission)\b|"
            r"\bpatient\b.*\b(today|admission)\b|"
            r"\bnew admission\b",
            t,
        )
    )


def _recent_ai_asked_create_fields(messages: list) -> bool:
    for msg in reversed(messages):
        content = ""
        if hasattr(msg, "type") and msg.type == "ai":
            content = str(msg.content)
        elif isinstance(msg, AIMessage):
            content = str(msg.content)
        elif isinstance(msg, dict) and msg.get("role") == "assistant":
            content = str(msg.get("content", ""))
        else:
            # stop at prior human once we've scanned trailing AI? keep scanning a few
            if hasattr(msg, "type") and msg.type == "human":
                continue
            continue
        if _CREATE_PROMPT_MARKER in content or (
            "full name" in content.lower()
            and "date of birth" in content.lower()
            and "gender" in content.lower()
        ):
            return True
        # Only look at the most recent AI turn that looks relevant
        if content.strip():
            return False
    return False


def _parse_patient_create_fields(text: str) -> dict | None:
    """Extract create_patient kwargs from free text. Returns None if incomplete."""
    from tools.patient_writeback import _normalize_dob, _normalize_gender

    raw = (text or "").strip()
    if not raw:
        return None

    code_m = re.search(r"\b(PT-\d+)\b", raw, re.I)
    patient_code = code_m.group(1).upper() if code_m else ""

    dob_m = re.search(
        r"\b(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{8})\b",
        raw,
    )
    if not dob_m:
        return None
    dob = _normalize_dob(dob_m.group(1))
    if not dob:
        return None

    gender = None
    for token in re.findall(r"[A-Za-z]+", raw):
        g = _normalize_gender(token)
        if g:
            gender = g
            break
    if not gender:
        return None

    as_admission = bool(
        re.search(r"\b(admit|admission|admitted|inpatient)\b", raw, re.I)
    )

    blood_m = re.search(
        r"(?<![A-Za-z])(AB|A|B|O)\s*([+-])(?![A-Za-z])|"
        r"\bblood(?:\s*type)?[:\s]+(AB|A|B|O)\s*([+-]?)",
        raw,
        re.I,
    )
    blood_type = ""
    if blood_m:
        if blood_m.group(1):
            blood_type = f"{blood_m.group(1).upper()}{blood_m.group(2)}"
        else:
            blood_type = f"{blood_m.group(3).upper()}{blood_m.group(4) or ''}"

    phone_m = re.search(r"\b(?:phone|tel|mobile)[:\s]*([+\d][\d\s-]{6,})\b", raw, re.I)
    if not phone_m:
        phone_m = re.search(r"\b(\+?\d{8,15})\b", raw)
    phone = phone_m.group(1).strip() if phone_m else ""

    # Name: strip known tokens from a comma/space separated blob
    name_src = raw
    for drop in (
        dob_m.group(0),
        patient_code,
        blood_type,
        phone,
    ):
        if drop:
            name_src = re.sub(re.escape(drop), " ", name_src, flags=re.I)
    name_src = re.sub(
        r"(?i)\b(male|female|other|unknown|admit|admission|admitted|inpatient|"
        r"outpatient|blood\s*type|phone|tel|mobile|yes|no|new|"
        r"add|create|register|name|dob|gender|today)\b",
        " ",
        name_src,
    )
    # Drop leading "patient" command word only
    name_src = re.sub(r"(?i)^\s*patient\s+", "", name_src)
    name_src = re.sub(r"[,:;|/]+", " ", name_src)
    name = " ".join(name_src.split()).strip(" -")
    if len(name) < 2:
        return None

    return {
        "full_name": name,
        "date_of_birth": dob,
        "gender": gender,
        "patient_code": patient_code,
        "blood_type": blood_type,
        "phone": phone,
        "as_admission": as_admission,
    }


def _execute_create_patient(fields: dict) -> str:
    raw = create_patient.invoke(fields)
    data = _parse_tool_json(raw)
    if not isinstance(data, dict):
        return "Could not create the patient (unexpected tool response)."
    if data.get("error"):
        return f"Could not create the patient: {data['error']}"
    status = data.get("status", "outpatient")
    return (
        f"Patient created successfully.\n"
        f"- Name: {data.get('full_name')}\n"
        f"- Code: {data.get('patient_code')}\n"
        f"- DOB: {data.get('date_of_birth')}\n"
        f"- Gender: {data.get('gender')}\n"
        f"- Status: {status}\n"
        f"Open Patients → {data.get('patient_code')} to view the chart."
    )


def _extract_preferred_ward(text: str) -> str | None:
    """Pull a stated preferred-ward value from transcript or Mem0 memory text."""
    if not text:
        return None
    match = re.search(
        r"(?:preferred|favourite|favorite)\s+ward\s+(?:is|=|:)\s*([^\n.]+)",
        text,
        re.I,
    )
    if match:
        ward = match.group(1).strip(" .\"'")
        # Trim Mem0/LLM trailing clauses ("… during the conversation")
        ward = re.split(
            r"\s+(?:during|for|in|when|while|as)\b", ward, maxsplit=1, flags=re.I
        )[0].strip(" .\"'")
        return ward or None
    match = re.search(
        r"(?:prefers?|preference)\s+(?:the\s+)?(?:ward\s+)?([A-Za-z0-9][\w\s-]{1,40})",
        text,
        re.I,
    )
    if match and "ward" in text.lower():
        return match.group(1).strip(" .\"'")
    return None


def _preference_recall_answer(
    user_text: str,
    *,
    messages: list | None = None,
    mem0_hits: list | None = None,
) -> str | None:
    """Answer preference recall from Mem0 hits or same-session transcript."""
    t = user_text.lower().strip()
    if not t:
        return None
    # Questions only — do not intercept "My preferred ward is …" statements
    is_question = "?" in t or bool(
        re.search(
            r"^\s*(what|which|do you|can you|tell me|remind me|recall)\b",
            t,
        )
    )
    asking_pref = bool(
        re.search(r"\b(preferred|preference|prefer)\b", t)
        or re.search(r"\b(what (is|was) my|do you remember|remember my)\b", t)
    )
    if not (is_question and asking_pref):
        return None

    asking_ward = bool(re.search(r"\bward\b", t))

    # Prefer Mem0 long-term hits (cross-session)
    for hit in mem0_hits or []:
        memory = str(hit.get("memory") or "").strip()
        if not memory:
            continue
        if asking_ward:
            ward = _extract_preferred_ward(memory)
            if ward:
                return f"Your preferred ward is {ward}."
            if re.search(r"\bward\b", memory, re.I):
                return f"From memory: {memory}"

    # Same-session transcript fallback
    for msg in reversed(messages or []):
        content = ""
        if hasattr(msg, "type") and msg.type == "human":
            content = str(msg.content)
        elif isinstance(msg, dict) and msg.get("role") in ("user", "human"):
            content = str(msg.get("content", ""))
        if not content:
            continue
        if asking_ward:
            ward = _extract_preferred_ward(content)
            if ward:
                return f"Your preferred ward is {ward}."

    if asking_ward:
        return (
            "I don't have a preferred ward saved for you yet. "
            "Tell me your preferred ward and I'll remember it."
        )
    return None


def _fast_path_answer(
    user_text: str,
    messages: list | None = None,
    *,
    mem0_hits: list | None = None,
) -> str | None:
    """Deterministic answers for common doctor/nurse Patient Agent prompts (avoids LLM hang)."""
    t = user_text.lower().strip()
    if not t:
        return None

    messages = messages or []

    pref = _preference_recall_answer(
        user_text, messages=messages, mem0_hits=mem0_hits
    )
    if pref:
        return pref

    # Acknowledge preference statements (Mem0 write_back still extracts the fact)
    stated_ward = _extract_preferred_ward(user_text)
    if stated_ward and "?" not in t:
        return f"Got it — I'll remember your preferred ward is {stated_ward}."

    # Multi-turn / one-shot patient create (doctor, nurse, admin — matches New Admission UI)
    awaiting = _recent_ai_asked_create_fields(messages)
    fields = _parse_patient_create_fields(user_text)
    if fields and (awaiting or _wants_create_patient(user_text)):
        return _execute_create_patient(fields)
    if awaiting and not fields:
        return (
            "I still need full name, date of birth, and gender to create the patient. "
            "Example: Fanny Tan, 2000.01.06, female, A+, admission yes"
        )
    if _wants_create_patient(user_text) and not fields:
        return _CREATE_ASK

    if re.search(
        r"summarize.*(patient|roster)|patients today|today.?s (patient|roster|overview)",
        t,
    ):
        raw = get_today_overview.invoke({})
        data = _parse_tool_json(raw)
        if not isinstance(data, dict):
            return "Could not load today's patient overview."
        pbs = data.get("patients_by_status") or {}
        appt = data.get("appointments_today") or {}
        return (
            f"Today's clinical overview ({data.get('date')}):\n"
            f"- Appointments today: {appt.get('total', 0)}\n"
            f"- Patients — admitted: {pbs.get('admitted', 0)}, "
            f"outpatient: {pbs.get('outpatient', 0)}, "
            f"discharged: {pbs.get('discharged', 0)}\n"
            f"- New admissions today: {data.get('new_admissions_today', 0)}\n"
            f"- Queue waiting: {data.get('queue_waiting', 0)}\n"
            f"- Pending diagnostic reports: {data.get('pending_diagnostic_reports', 0)}\n"
            "Ask about a specific patient (name or PT-code) for a fuller summary."
        )

    if re.search(r"\btreatment plan\b|\bdraft\b.*\b(plan|treatment)\b", t):
        code_match = re.search(r"\bPT-\d+\b", user_text, re.I)
        query = code_match.group(0) if code_match else None
        if not query:
            stripped = re.sub(
                r"(?i)draft\s+(a\s+)?treatment\s+plan\s+(for\s+)?(patient\s+)?",
                "",
                user_text,
            ).strip(" []")
            if stripped and stripped.lower() not in {"patient", "[patient]"}:
                query = stripped
        if not query:
            return (
                "To draft a treatment plan, name a patient (e.g. PT-1042 Lim Wei Ming). "
                "I will pull their conditions and medications and produce an AI-assisted "
                "draft for clinician review."
            )

        matches = _parse_tool_json(find_patient.invoke({"query": query}))
        if not isinstance(matches, list) or not matches:
            return (
                f"No patient found matching '{query}'. "
                "Check the patient code or name and try again."
            )

        patient = matches[0]
        summary = _parse_tool_json(
            get_patient_clinical_summary.invoke({"patient_id": str(patient["id"])})
        )
        if not isinstance(summary, dict) or summary.get("error"):
            return (
                f"Found {patient.get('full_name')} ({patient.get('patient_code')}) "
                "but could not load the clinical summary."
            )

        profile = summary.get("patient") or patient
        conditions = summary.get("conditions") or []
        medications = summary.get("medications") or []
        cond_lines = (
            "\n".join(
                f"- {c.get('condition_name')} ({c.get('icd_code') or 'n/a'})"
                for c in conditions
            )
            or "- None recorded"
        )
        med_lines = (
            "\n".join(
                f"- {m.get('drug_name')} {m.get('dosage') or ''} "
                f"{m.get('frequency') or ''}".strip()
                for m in medications
            )
            or "- None active"
        )
        return (
            "DRAFT — AI-assisted. Requires clinician review and approval.\n\n"
            f"Patient: {profile.get('full_name')} ({profile.get('patient_code')}), "
            f"status: {profile.get('status')}.\n\n"
            f"Active conditions:\n{cond_lines}\n\n"
            f"Active medications:\n{med_lines}\n\n"
            "Proposed plan objectives:\n"
            "- Address active conditions with evidence-based interventions\n"
            "- Continue or optimize current medications pending clinician confirmation\n"
            "- Schedule follow-up and monitoring appropriate to severity\n\n"
            "Open the patient Treatment Plan tab to Review & Approve or Regenerate "
            "a durable draft in the chart."
        )

    return None


def _build_messages(state: AgentState, context_hint: str) -> list:
    """Build the message list for the agent.

    Chat mode: use state messages. Autonomous mode: synthesize a single system
    message from the task payload (no user message).
    """
    messages = state.get("messages", [])
    if state.get("entry_mode") == "autonomous":
        task = state.get("task") or "Autonomous run: perform your assigned patient management task."
        return [SystemMessage(content=f"{task}{context_hint}")]
    return messages


def patient_management_node(state: AgentState) -> AgentState:
    """
    LangGraph node: Patient Management Agent.

    Reads from and writes to state["context"]["patient_context"] for PA<->Diagnose Agent collaboration.
    Allowed tools: rag_retrieval (T2), document_parsing (T5), audit_logging (T1), fallback_handler (T7).
    """
    try:
        messages = list(state.get("messages", []))
        entry_mode = state.get("entry_mode", "chat")
        context = state.get("context", {})
        patient_context = context.get("patient_context", {})

        role_note = ""
        if entry_mode != "autonomous":
            user_role = state.get("user_role", "doctor")
            # Nurse may create (New Admission) but not update demographics via chat
            mem0_hits = context.get("mem0_hits") or []
            fast = _fast_path_answer(
                _last_user_text(messages),
                messages,
                mem0_hits=mem0_hits if isinstance(mem0_hits, list) else [],
            )
            if fast:
                messages.append(AIMessage(content=fast))
                return {
                    **state,
                    "messages": messages,
                    "active_agent": "patient_management",
                }
            if user_role == "nurse":
                role_note = (
                    "\nUser is a Nurse: you may create/admit patients with create_patient. "
                    "Do NOT call update_patient — direct them to a doctor/admin for "
                    "demographic edits."
                )

        llm = _get_llm()
        tools = TOOLS if entry_mode == "autonomous" else CHAT_TOOLS
        agent_executor = create_react_agent(llm, tools, prompt=SYSTEM_PROMPT + role_note)

        context_hint = ""
        if patient_context:
            context_hint = (
                f"\n[Shared patient context from Medical Diagnostics: "
                f"{json.dumps(patient_context)[:500]}]"
            )
        mem0_block = context.get("mem0_prompt_block") or ""
        if mem0_block:
            context_hint = f"{context_hint}\n{mem0_block}"
        # Patient-scoped Mem0 re-search when a patient is in context
        patient_id = patient_context.get("patient_id")
        if patient_id and state.get("user_id"):
            try:
                import asyncio
                from memory.mem0_client import search_memory, format_mem0_prompt_block

                last_user = _last_user_text(messages)
                scoped = asyncio.run(
                    search_memory(
                        state["user_id"],
                        last_user or "patient context",
                        agent_id="patient_management",
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
        if "patient_id" in patient_context:
            updated_context["patient_context"] = patient_context

        return {
            **state,
            "messages": new_messages,
            "active_agent": "patient_management",
            "context": updated_context,
        }

    except Exception as exc:
        from tools.fallback_handler import agent_fallback_message

        friendly = agent_fallback_message("patient_management", exc)
        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=friendly))
        return {**state, "messages": messages, "active_agent": "patient_management"}
