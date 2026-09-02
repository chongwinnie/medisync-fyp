"""Read-only Postgres query tools for the Appointment Scheduling Agent.

These let Appointment Agent read the system of record (appointments, staff shifts, conflicts)
directly, mirroring the frontend data layer. The agent runs in admin/system
context (Appointment Agent is Admin-only per CoreFunction.md, enforced by the supervisor), so
reads are not role-filtered here; per-user visibility is enforced on the frontend.
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
def get_appointments(staff_id: str | None = None, patient_id: str | None = None,
                     days_ahead: int = 14) -> str:
    """
    Fetch upcoming appointments from Postgres (next `days_ahead` days, not cancelled),
    joined with patient and staff names. Use this to read the schedule.

    Args:
        staff_id: Optional staff UUID to filter to one doctor/nurse.
        patient_id: Optional patient UUID to filter to one patient.
        days_ahead: Window in days from now (default 14).

    Returns:
        JSON array: id, patient_id, patient_name, staff_id, staff_name, visit_type,
        start_time, end_time, status, conflict_detected, notes, room_number,
        patient_email.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT a.id, a.patient_id, p.full_name AS patient_name,
                       a.staff_id, s.full_name AS staff_name,
                       a.visit_type, a.start_time, a.end_time, a.status,
                       a.conflict_detected, a.notes, r.room_number,
                       p.email AS patient_email
                FROM appointments a
                JOIN patients p ON p.id = a.patient_id
                LEFT JOIN staff s ON s.id = a.staff_id
                LEFT JOIN rooms r ON r.id = a.room_id
                WHERE a.status <> 'cancelled'
                  AND a.start_time >= now()
                  AND a.start_time <= now() + make_interval(secs => $1)
                  AND ($2::uuid IS NULL OR a.staff_id = $2::uuid)
                  AND ($3::uuid IS NULL OR a.patient_id = $3::uuid)
                ORDER BY a.start_time
                """,
                days_ahead * 86400,
                staff_id if staff_id else None,
                patient_id if patient_id else None,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_staff_availability(staff_id: str, day: str) -> str:
    """
    Fetch a staff member's working hours and existing appointments for one date, so the
    agent can pick a free slot that respects the doctor's schedule ("doctor preferences"
    = recurring preferred working hours + approved leaves). This is the read path for
    booking/rescheduling from a patient email.

    Args:
        staff_id: Staff UUID.
        day: ISO date string, e.g. "2026-07-15".

    Returns:
        JSON object: { staff_id, staff_name, staff_email, day, weekday,
        shift: {start, end} | null, preferred_hours: {start, end, working_days,
        time_zone, notes} | null, on_leave: bool, leave: {...} | null,
        appointments: [{id, start_time, end_time, patient_name, status}] }.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            day_date = date.fromisoformat(day)
            staff = await conn.fetchrow(
                """SELECT s.id, s.full_name, u.email AS email
                   FROM staff s LEFT JOIN users u ON u.id = s.user_id
                   WHERE s.id = $1::uuid""",
                staff_id,
            )
            if staff is None:
                return json.dumps({"error": f"staff {staff_id} not found"})
            shift = await conn.fetchrow(
                """SELECT start_time, end_time FROM shift_schedules
                   WHERE staff_id = $1::uuid AND shift_date = $2::date""",
                staff_id, day_date,
            )
            prefs = await conn.fetchrow(
                """SELECT preferred_start_time, preferred_end_time, working_days,
                          time_zone, notes
                   FROM staff_preferences WHERE staff_id = $1::uuid""",
                staff_id,
            )
            leave = await conn.fetchrow(
                """SELECT start_date, end_date, leave_type, status
                   FROM staff_leaves
                   WHERE staff_id = $1::uuid
                     AND $2::date >= start_date AND $2::date <= end_date
                     AND status = 'approved'""",
                staff_id, day_date,
            )
            appts = await conn.fetch(
                """SELECT a.id, a.start_time, a.end_time, a.status,
                          p.full_name AS patient_name
                   FROM appointments a
                   JOIN patients p ON p.id = a.patient_id
                   WHERE a.staff_id = $1::uuid
                     AND a.status <> 'cancelled'
                     AND a.start_time::date = $2::date
                   ORDER BY a.start_time""",
                staff_id, day_date,
            )
            return json.dumps(
                {
                    "staff_id": str(staff["id"]),
                    "staff_name": staff["full_name"],
                    "staff_email": staff["email"],
                    "day": day,
                    "weekday": day_date.isoweekday(),
                    "shift": (
                        {"start": f"{day}T{shift['start_time']}",
                         "end": f"{day}T{shift['end_time']}"}
                        if shift else None
                    ),
                    "preferred_hours": (
                        {"start": str(prefs["preferred_start_time"]),
                         "end": str(prefs["preferred_end_time"]),
                         "working_days": list(prefs["working_days"]),
                         "time_zone": prefs["time_zone"],
                         "notes": prefs["notes"]}
                        if prefs else None
                    ),
                    "on_leave": leave is not None,
                    "leave": (
                        {"start_date": str(leave["start_date"]),
                         "end_date": str(leave["end_date"]),
                         "leave_type": leave["leave_type"],
                         "status": leave["status"]}
                        if leave else None
                    ),
                    "appointments": [dict(r) for r in appts],
                },
                ensure_ascii=False,
                default=_json_default,
            )
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_appointment_conflicts() -> str:
    """
    Fetch all upcoming appointments flagged with a detected conflict (conflict_detected=true,
    not cancelled). Use for the nightly conflict scan autonomous task.

    Returns:
        JSON array: id, staff_name, patient_name, start_time, end_time, visit_type.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT a.id, s.full_name AS staff_name, p.full_name AS patient_name,
                       a.visit_type, a.start_time, a.end_time
                FROM appointments a
                LEFT JOIN staff s ON s.id = a.staff_id
                JOIN patients p ON p.id = a.patient_id
                WHERE a.conflict_detected = true
                  AND a.status <> 'cancelled'
                  AND a.start_time >= now()
                ORDER BY a.start_time
                """
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())
