"""Clinical write-back tools — let autonomous agents persist AI-assisted drafts.

Safety model: the AI writes ONLY the AI-assisted fields. Clinician-owned fields
(findings, status, finalized_by/_at, reviewed_by, objectives) are never touched,
so an autonomous run can never finalize a report or plan — it only records an
AI draft for clinician review. Every write is logged to audit_logs with old and
new values in a single transaction.

Tools:
- update_diagnostic_report_ai_draft: writes diagnostic_reports.ai_summary /
  ai_confidence / ai_assisted for one report.
- update_treatment_plan_ai_draft: writes treatment_plans.ai_draft_content /
  ai_assisted for one plan.
"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from langchain_core.tools import tool

from db.postgres import apg_connect


def _json_default(obj):
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def _dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=_json_default)


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=20)


def _valid_uuid(value: str) -> bool:
    try:
        UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


@tool
def update_diagnostic_report_ai_draft(report_id: str, ai_summary: str, ai_confidence: float) -> str:
    """
    Persist an AI-assisted draft summary onto a diagnostic report. Writes ONLY the
    AI fields: ai_summary, ai_confidence, ai_assisted=true. Does NOT change status,
    findings, or finalization fields — the report stays pending clinician review.

    Args:
        report_id: Diagnostic report UUID (from get_pending_diagnostic_reports).
        ai_summary: AI-assisted summary text for clinician review.
        ai_confidence: Confidence 0.0–1.0 (clamped, stored to 4 decimals).

    Returns:
        JSON: {"ok": true, "report_id": ..., "updated": [...]} or {"error": ...}.
    """
    if not _valid_uuid(report_id):
        return _dumps({"error": f"invalid report_id: {report_id}"})
    confidence = round(max(0.0, min(1.0, float(ai_confidence))), 4)

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                old = await conn.fetchrow(
                    "SELECT id, ai_summary, ai_confidence, ai_assisted, status "
                    "FROM diagnostic_reports WHERE id = $1::uuid",
                    report_id,
                )
                if old is None:
                    return _dumps({"error": f"report {report_id} not found"})
                await conn.execute(
                    "UPDATE diagnostic_reports SET ai_summary = $1, ai_confidence = $2, "
                    "ai_assisted = true, updated_at = now() WHERE id = $3::uuid",
                    ai_summary, confidence, report_id,
                )
                await conn.execute(
                    "INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values, created_at) "
                    "VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())",
                    "ai_writeback_diagnostic_report",
                    "diagnostic_reports",
                    report_id,
                    _dumps({
                        "ai_summary": old["ai_summary"],
                        "ai_confidence": old["ai_confidence"],
                        "ai_assisted": old["ai_assisted"],
                        "status": old["status"],
                    }),
                    _dumps({
                        "ai_summary": ai_summary,
                        "ai_confidence": confidence,
                        "ai_assisted": True,
                        "status": old["status"],
                    }),
                )
            return _dumps({"ok": True, "report_id": report_id,
                           "updated": ["ai_summary", "ai_confidence", "ai_assisted"],
                           "status_unchanged": str(old["status"])})
        finally:
            await conn.close()

    return _run(_q())


@tool
def update_treatment_plan_ai_draft(plan_id: str, ai_draft_content: str) -> str:
    """
    Persist an AI-assisted draft onto a treatment plan. Writes ONLY the AI fields:
    ai_draft_content and ai_assisted=true. Does NOT change status, objectives, or
    reviewed_by — the plan stays a draft for clinician approval.

    Args:
        plan_id: Treatment plan UUID.
        ai_draft_content: AI-assisted draft content for clinician review.

    Returns:
        JSON: {"ok": true, "plan_id": ..., "updated": [...]} or {"error": ...}.
    """
    if not _valid_uuid(plan_id):
        return _dumps({"error": f"invalid plan_id: {plan_id}"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                old = await conn.fetchrow(
                    "SELECT id, ai_draft_content, ai_assisted, status "
                    "FROM treatment_plans WHERE id = $1::uuid",
                    plan_id,
                )
                if old is None:
                    return _dumps({"error": f"plan {plan_id} not found"})
                await conn.execute(
                    "UPDATE treatment_plans SET ai_draft_content = $1, ai_assisted = true, "
                    "updated_at = now() WHERE id = $2::uuid",
                    ai_draft_content, plan_id,
                )
                await conn.execute(
                    "INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values, created_at) "
                    "VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())",
                    "ai_writeback_treatment_plan",
                    "treatment_plans",
                    plan_id,
                    _dumps({
                        "ai_draft_content": old["ai_draft_content"],
                        "ai_assisted": old["ai_assisted"],
                        "status": old["status"],
                    }),
                    _dumps({
                        "ai_draft_content": ai_draft_content,
                        "ai_assisted": True,
                        "status": old["status"],
                    }),
                )
            return _dumps({"ok": True, "plan_id": plan_id,
                           "updated": ["ai_draft_content", "ai_assisted"],
                           "status_unchanged": str(old["status"])})
        finally:
            await conn.close()

    return _run(_q())
