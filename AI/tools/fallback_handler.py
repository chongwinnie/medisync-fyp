"""Fallback handler tool — graceful degradation when an agent or tool fails."""
from __future__ import annotations

import json

from langchain_core.tools import tool

AGENT_FRIENDLY_NAMES = {
    "patient_management": "Patient Management",
    "medical_diagnostics": "Medical Diagnostics",
    "appointment_scheduling": "Appointment Scheduling",
    "inventory_resource": "Inventory & Resource",
    "staff_management": "Staff Management",
    "supervisor": "Supervisor",
}

USER_MESSAGES = {
    "timeout": "The request took too long to process. Please try again shortly.",
    "permission": "You do not have permission to perform this action.",
    "not_found": "The requested information could not be found.",
    "db_error": "A database error occurred. Our team has been notified. Please try again.",
    "api_error": "An external service is temporarily unavailable. Please try again.",
    "unknown": "An unexpected error occurred. Please rephrase your request or try again.",
}


def _classify_error(error: str) -> str:
    error_lower = error.lower()
    if "timeout" in error_lower or "timed out" in error_lower:
        return "timeout"
    if "permission" in error_lower or "forbidden" in error_lower or "unauthorized" in error_lower:
        return "permission"
    if "not found" in error_lower or "404" in error_lower:
        return "not_found"
    if "database" in error_lower or "db" in error_lower or "postgres" in error_lower:
        return "db_error"
    if "api" in error_lower or "connection" in error_lower or "http" in error_lower:
        return "api_error"
    return "unknown"


@tool
def handle_agent_failure(
    agent_name: str,
    error: str,
    user_message: str,
    log_audit: bool = True,
) -> str:
    """
    Handle a graceful degradation when an agent or tool fails.

    Args:
        agent_name: Name of the failing agent or tool (e.g., 'patient_management').
        error: The error string or exception message.
        user_message: The original user message that triggered the failure.
        log_audit: Whether to attempt writing an audit log entry.

    Returns:
        JSON string with user-facing message and internal metadata.
    """
    error_type = _classify_error(error)
    friendly_agent = AGENT_FRIENDLY_NAMES.get(agent_name, agent_name)
    user_facing = USER_MESSAGES[error_type]

    if log_audit:
        try:
            from tools.audit_logging import write_audit_log
            write_audit_log.invoke({
                "action": "agent_failure",
                "entity_type": "agent",
                "entity_id": "",
                "details": {
                    "agent_name": agent_name,
                    "error": error[:500],
                    "error_type": error_type,
                    "user_message_preview": user_message[:200],
                },
                "table_name": "ai_agent_logs",
            })
        except Exception:
            pass  # never let fallback itself fail

    return json.dumps({
        "status": "fallback",
        "agent": friendly_agent,
        "error_type": error_type,
        "user_message": user_facing,
        "support_hint": "If this persists, contact your system administrator.",
    })


def agent_fallback_message(agent_name: str, exc: BaseException) -> str:
    """Return a user-facing fallback message (plain text) for a raised exception.

    Used by agent node try/except blocks so the chat UI receives a friendly
    string instead of raw fallback JSON. Also logs the full traceback (so agent
    failures are diagnosable — the previous code swallowed exceptions silently)
    and writes a best-effort audit row.
    """
    import logging

    logger = logging.getLogger("medisync.agents")
    error_str = f"{type(exc).__name__}: {exc}"
    logger.error(
        "Agent %s raised an exception: %s",
        agent_name,
        error_str,
        exc_info=(type(exc), exc, exc.__traceback__),
    )

    cls_name = type(exc).__name__
    if "Recursion" in cls_name or "recursion" in error_str.lower():
        # ReAct agent hit the graph recursion limit (usually a tool-calling loop).
        error_type = "recursion"
        user_facing = (
            "I ran out of steps while working on that. Please make the request more "
            "specific, or ask for one thing at a time so I can complete it."
        )
    else:
        error_type = _classify_error(error_str)
        user_facing = USER_MESSAGES[error_type]

    try:
        from tools.audit_logging import write_audit_log
        write_audit_log.invoke({
            "action": "agent_failure",
            "entity_type": "agent",
            "entity_id": "",
            "details": {
                "agent_name": agent_name,
                "error": error_str[:500],
                "error_type": error_type,
            },
            "table_name": "ai_agent_logs",
        })
    except Exception:
        pass  # never let fallback itself fail

    return user_facing
