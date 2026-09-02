"""Read-only Postgres query tools for the Staff Management Agent.

Lets the agent read the staff roster, published shift schedules, and attendance
from Postgres. All queries are read-only.
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
def list_staff(role: str | None = None, limit: int = 100) -> str:
    """
    List staff members from Postgres with optional role filter. Use this to
    answer "which doctors/nurses are available" and to resolve a staff name to a
    staff_id before calling get_staff_availability.

    Args:
        role: Optional user_role filter: 'admin', 'doctor', 'nurse', 'staff'.
        limit: Max rows (default 100, capped at 500).

    Returns:
        JSON array: id (staff UUID), staff_code, full_name, role, email,
        department, specialization, phone, is_active.
    """
    limit = max(1, min(int(limit), 500))

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT s.id, s.staff_code, s.full_name, u.role, u.email,
                       s.department, s.specialization, s.phone, u.is_active
                FROM staff s
                JOIN users u ON u.id = s.user_id
                WHERE ($1::user_role IS NULL OR u.role = $1::user_role)
                ORDER BY s.full_name
                LIMIT $2
                """,
                role if role else None,
                limit,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_shift_schedules(day: str | None = None) -> str:
    """
    Fetch published shift schedules for one date from Postgres. Use this to
    answer "who is on duty today / on <date>" and to find shift gaps.

    Args:
        day: Optional ISO date string, e.g. "2026-07-15". Defaults to today
            (server local).

    Returns:
        JSON array: staff_id, staff_name, role, shift_date, start_time, end_time,
        shift_type, location, conflict_flagged.
    """
    day_date = date.fromisoformat(day) if day else date.today()

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT ss.staff_id, s.full_name AS staff_name, u.role,
                       ss.shift_date, ss.start_time, ss.end_time, ss.shift_type,
                       ss.location, ss.conflict_flagged
                FROM shift_schedules ss
                JOIN staff s ON s.id = ss.staff_id
                JOIN users u ON u.id = s.user_id
                WHERE ss.shift_date = $1::date
                  AND ss.is_published = true
                ORDER BY ss.start_time, s.full_name
                """,
                day_date,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_attendance(day: str | None = None) -> str:
    """
    Fetch attendance records for one date from Postgres. Use this to answer
    "who clocked in today / on <date>" and overtime questions.

    Args:
        day: Optional ISO date string, e.g. "2026-07-15". Defaults to today
            (server local).

    Returns:
        JSON array: staff_id, staff_name, role, attendance_date, clock_in,
        clock_out, hours_worked, overtime_hours, status, notes.
    """
    day_date = date.fromisoformat(day) if day else date.today()

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT a.staff_id, s.full_name AS staff_name, u.role,
                       a.attendance_date, a.clock_in, a.clock_out, a.hours_worked,
                       a.overtime_hours, a.status, a.notes
                FROM attendance_records a
                JOIN staff s ON s.id = a.staff_id
                JOIN users u ON u.id = s.user_id
                WHERE a.attendance_date = $1::date
                ORDER BY s.full_name
                """,
                day_date,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())
