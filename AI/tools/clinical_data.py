"""Read-only Postgres query tools for clinical agents.

These let agents read the system of record (Postgres) directly for exact
status-filtered lookups (e.g. pending diagnostic reports), complementing the
semantic Chroma RAG tool. All queries are read-only.
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


def _to_json(rows: list[asyncio.Record]) -> str:
    return json.dumps([dict(r) for r in rows], ensure_ascii=False, default=_json_default)


def _run(coro):
    """Run a coroutine from a sync tool, tolerating a pre-existing event loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=20)


@tool
def get_pending_diagnostic_reports() -> str:
    """
    Fetch diagnostic reports awaiting clinician review (status pending_review or draft),
    joined with the patient name. Use this for autonomous "review pending reports" tasks
    instead of semantic search — it reads the authoritative Postgres record set.

    Returns:
        JSON array of reports with id, report_type, title, findings, ai_summary,
        ai_confidence, status, ai_assisted, report_date, patient_id, patient_code,
        patient_name.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT dr.id, dr.report_type, dr.title, dr.findings, dr.ai_summary,
                       dr.ai_confidence, dr.status, dr.ai_assisted, dr.report_date,
                       p.id AS patient_id, p.patient_code, p.full_name AS patient_name
                FROM diagnostic_reports dr
                JOIN patients p ON p.id = dr.patient_id
                WHERE dr.status IN ('pending_review', 'draft')
                ORDER BY dr.report_date DESC
                """
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_patient_clinical_summary(patient_id: str) -> str:
    """
    Fetch a consolidated clinical summary for one patient from Postgres: demographics,
    active conditions, active medications, recent vitals (last 5), recent lab results
    (last 5), and recent diagnostic reports (last 5).

    Args:
        patient_id: Patient UUID (can be read from get_pending_diagnostic_reports).

    Returns:
        JSON object with patient, conditions, medications, vitals, lab_results,
        diagnostic_reports.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                is_uuid = False
                try:
                    UUID(str(patient_id))
                    is_uuid = True
                except ValueError:
                    pass

                if is_uuid:
                    patient = await conn.fetchrow(
                        """SELECT id, patient_code, full_name, email, date_of_birth, gender,
                           blood_type, allergies, status
                           FROM patients WHERE id = $1::uuid""",
                        patient_id,
                    )
                else:
                    patient = await conn.fetchrow(
                        """SELECT id, patient_code, full_name, email, date_of_birth, gender,
                           blood_type, allergies, status
                           FROM patients WHERE patient_code = $1 OR patient_code = UPPER($1)""",
                        patient_id,
                    )

                if patient is None:
                    return json.dumps({"error": f"patient {patient_id} not found"})

                pid = str(patient["id"])

                conditions = await conn.fetch(
                    """SELECT icd_code, condition_name, severity, onset_date, is_active
                       FROM patient_conditions
                       WHERE patient_id = $1::uuid AND is_active = true
                       ORDER BY onset_date DESC""",
                    pid,
                )
                medications = await conn.fetch(
                    """SELECT drug_name, dosage, frequency, route, status, start_date, end_date, notes
                       FROM medications
                       WHERE patient_id = $1::uuid AND status = 'active'
                       ORDER BY start_date DESC""",
                    pid,
                )
                vitals = await conn.fetch(
                    """SELECT heart_rate, blood_pressure_sys, blood_pressure_dia,
                       temperature, o2_saturation, weight_kg, recorded_at
                       FROM patient_vitals
                       WHERE patient_id = $1::uuid
                       ORDER BY recorded_at DESC LIMIT 5""",
                    pid,
                )
                labs = await conn.fetch(
                    """SELECT test_name, result_value, unit, reference_range, is_abnormal,
                       status, collected_at
                       FROM lab_results
                       WHERE patient_id = $1::uuid
                       ORDER BY collected_at DESC LIMIT 5""",
                    pid,
                )
                reports = await conn.fetch(
                    """SELECT id, report_type, title, findings, ai_summary, status,
                       ai_assisted, report_date
                       FROM diagnostic_reports
                       WHERE patient_id = $1::uuid
                       ORDER BY report_date DESC LIMIT 5""",
                    pid,
                )
            return json.dumps(
                {
                    "patient": dict(patient),
                    "conditions": [dict(r) for r in conditions],
                    "medications": [dict(r) for r in medications],
                    "vitals": [dict(r) for r in vitals],
                    "lab_results": [dict(r) for r in labs],
                    "diagnostic_reports": [dict(r) for r in reports],
                },
                ensure_ascii=False,
                default=_json_default,
            )
        finally:
            await conn.close()

    return _run(_q())
