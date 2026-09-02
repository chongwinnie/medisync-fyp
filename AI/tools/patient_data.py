"""Read-only Postgres query tools for patient list / lookup / today's overview.

Complements tools.clinical_data (which needs a known patient_id) by giving the
Patient Management Agent a way to list patients, resolve a name/code to a
patient_id, and answer aggregate "today" questions (e.g. "how many patients do
we have for today"). All queries are read-only.
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


def _to_json(rows) -> str:
    return json.dumps([dict(r) for r in rows], ensure_ascii=False, default=_json_default)


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=20)


@tool
def list_patients(
    status: str | None = None,
    search: str | None = None,
    limit: int = 50,
) -> str:
    """
    List patients from Postgres with optional filtering. Use this to answer
    "how many / which patients" questions when you don't already have a patient_id.

    Args:
        status: Optional patient_status filter: 'outpatient', 'admitted',
            'discharged', or 'inactive'. Omit to list all.
        search: Optional substring match on patient_code or full_name (case-insensitive).
        limit: Max rows to return (default 50, capped at 200).

    Returns:
        JSON array: id, patient_code, full_name, status, gender, blood_type,
        primary_doctor_id, primary_doctor_name, admitted_at, discharged_at, email.
    """
    limit = max(1, min(int(limit), 200))

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT p.id, p.patient_code, p.full_name, p.status, p.gender,
                       p.blood_type, p.primary_doctor_id, d.full_name AS primary_doctor_name,
                       p.admitted_at, p.discharged_at, p.email
                FROM patients p
                LEFT JOIN staff d ON d.id = p.primary_doctor_id
                WHERE ($1::patient_status IS NULL OR p.status = $1::patient_status)
                  AND ($2::text IS NULL
                       OR p.full_name ILIKE '%' || $2 || '%'
                       OR p.patient_code ILIKE '%' || $2 || '%')
                ORDER BY p.full_name
                LIMIT $3
                """,
                status if status else None,
                search if search else None,
                limit,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def find_patient(query: str) -> str:
    """
    Resolve a patient name or patient_code to a patient_id. Use this before
    calling get_patient_clinical_summary when the user referred to a patient by
    name rather than by UUID.

    Args:
        query: Patient name or patient_code (substring match, case-insensitive).
            Phrases like "PT-1043 Tan Mei Lin" are supported (code + name).

    Returns:
        JSON array of matches: id, patient_code, full_name, status,
        primary_doctor_name. Empty array means no matching patients.
    """
    import re

    async def _fetch_with_similarity(conn, q: str, code: str | None):
        return await conn.fetch(
            """
            SELECT p.id, p.patient_code, p.full_name, p.status,
                   d.full_name AS primary_doctor_name
            FROM patients p
            LEFT JOIN staff d ON d.id = p.primary_doctor_id
            WHERE p.full_name ILIKE '%' || $1 || '%'
               OR p.patient_code ILIKE '%' || $1 || '%'
               OR p.email ILIKE '%' || $1 || '%'
               OR ($2::text IS NOT NULL AND p.patient_code ILIKE $2)
            ORDER BY
              CASE WHEN $2::text IS NOT NULL AND p.patient_code ILIKE $2 THEN 0 ELSE 1 END,
              similarity(p.full_name, $1) DESC
            LIMIT 10
            """,
            q,
            code,
        )

    async def _fetch_ilike_fallback(conn, q: str, code: str | None):
        return await conn.fetch(
            """
            SELECT p.id, p.patient_code, p.full_name, p.status,
                   d.full_name AS primary_doctor_name
            FROM patients p
            LEFT JOIN staff d ON d.id = p.primary_doctor_id
            WHERE p.full_name ILIKE '%' || $1 || '%'
               OR p.patient_code ILIKE '%' || $1 || '%'
               OR p.email ILIKE '%' || $1 || '%'
               OR ($2::text IS NOT NULL AND p.patient_code ILIKE $2)
            ORDER BY
              CASE WHEN $2::text IS NOT NULL AND p.patient_code ILIKE $2 THEN 0
                   WHEN p.patient_code ILIKE $1 THEN 1
                   WHEN p.full_name ILIKE $1 THEN 2
                   ELSE 3 END,
              p.full_name
            LIMIT 10
            """,
            q,
            code,
        )

    async def _q() -> str:
        # Prefer pg_trgm similarity ranking when available
        # (supabase/migrations/20260718_fixnurse1_pg_trgm.sql).
        q = (query or "").strip()
        code_match = re.search(r"PT-\d+", q, re.IGNORECASE)
        code = code_match.group(0).upper() if code_match else None
        # Prefer bare name tokens when a code is present so ILIKE can match
        name_only = re.sub(r"PT-\d+", " ", q, flags=re.IGNORECASE).strip()
        search_term = name_only if name_only else q

        conn = await apg_connect()
        try:
            has_trgm = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')"
            )
            if has_trgm:
                rows = await _fetch_with_similarity(conn, search_term or q, code)
            else:
                rows = await _fetch_ilike_fallback(conn, search_term or q, code)
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_today_overview() -> str:
    """
    Fetch a dashboard-style aggregate snapshot of today's activity from Postgres.
    Use this to answer "how many patients do we have for today" and similar
    operational overview questions without needing a patient_id.

    Returns a JSON object with:
        date: today's date (server local),
        appointments_today: {total, by_status: {scheduled, confirmed, ...}},
        patients_by_status: {outpatient, admitted, discharged, inactive},
        new_admissions_today: count,
        queue_waiting: count of patients waiting in the appointment queue,
        pending_diagnostic_reports: count,
        low_stock_items: count.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                appt_rows = await conn.fetch(
                    """SELECT status, COUNT(*)::int AS n
                       FROM appointments
                       WHERE start_time::date = CURRENT_DATE
                         AND status <> 'cancelled'
                       GROUP BY status"""
                )
                status_rows = await conn.fetch(
                    """SELECT status, COUNT(*)::int AS n
                       FROM patients GROUP BY status"""
                )
                new_admissions = await conn.fetchval(
                    """SELECT COUNT(*)::int FROM patients
                       WHERE admitted_at::date = CURRENT_DATE"""
                )
                queue_waiting = await conn.fetchval(
                    """SELECT COUNT(*)::int FROM appointment_queue
                       WHERE status = 'waiting'"""
                )
                pending_reports = await conn.fetchval(
                    """SELECT COUNT(*)::int FROM diagnostic_reports
                       WHERE status IN ('pending_review', 'draft')"""
                )
                low_stock = await conn.fetchval(
                    """SELECT COUNT(*)::int FROM inventory_items
                       WHERE status = 'active'
                         AND current_stock <= minimum_level"""
                )
            by_status = {r["status"]: r["n"] for r in appt_rows}
            patients_by_status = {r["status"]: r["n"] for r in status_rows}
            return json.dumps(
                {
                    "date": date.today().isoformat(),
                    "appointments_today": {
                        "total": sum(by_status.values()),
                        "by_status": by_status,
                    },
                    "patients_by_status": patients_by_status,
                    "new_admissions_today": new_admissions,
                    "queue_waiting": queue_waiting,
                    "pending_diagnostic_reports": pending_reports,
                    "low_stock_items": low_stock,
                },
                ensure_ascii=False,
                default=_json_default,
            )
        finally:
            await conn.close()

    return _run(_q())
