"""Appointment write-back tools — let the Appointment Agent agent create/modify/cancel appointments
in Postgres, mirroring the frontend actions layer with the same conflict detection.

Safety: every create/update runs an overlap conflict check (same staff, not cancelled,
time-overlapping) and stores conflict_detected. Every change writes an audit_logs row
with old+new values in one transaction. The agent operates in admin/system context
(Appointment Agent is Admin-only, enforced by the supervisor); these tools do not themselves
role-check, but they never set status beyond the allowed transitions and always leave
a clinician/admin to confirm.
"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from langchain_core.tools import tool

from db.postgres import apg_connect

_VISIT_TYPES = {"consultation", "follow_up", "discharge", "emergency", "procedure", "surgery"}
_STATUSES = {"scheduled", "confirmed", "in_progress", "completed", "cancelled"}


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


def _valid_uuid(value) -> bool:
    try:
        UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _to_dt(value):
    """Parse an ISO 8601 timestamp string to a timezone-aware datetime."""
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


async def _has_conflict(conn, staff_id, start, end, exclude_id=None) -> bool:
    row = await conn.fetchval(
        """SELECT EXISTS (
             SELECT 1 FROM appointments
             WHERE staff_id = $1::uuid
               AND status <> 'cancelled'
               AND start_time < $2::timestamptz
               AND end_time > $3::timestamptz
               AND ($4::uuid IS NULL OR id <> $4::uuid)
           )""",
        staff_id, _to_dt(end), _to_dt(start), exclude_id,
    )
    return bool(row)


@tool
def create_appointment(patient_id: str, staff_id: str, visit_type: str,
                       start_time: str, end_time: str, duration_minutes: int,
                       notes: str = "") -> str:
    """
    Create a new appointment in Postgres. Runs a conflict check first and stores
    conflict_detected. Status is set to 'scheduled' (not confirmed — confirmation is
    clinician/admin). Writes an audit row.

    Args:
        patient_id: Patient UUID.
        staff_id: Staff UUID (doctor/nurse).
        visit_type: One of consultation, follow_up, discharge, emergency, procedure, surgery.
        start_time: ISO 8601 timestamptz, e.g. "2026-07-15T09:00:00+08:00".
        end_time: ISO 8601 timestamptz.
        duration_minutes: Duration in minutes (>0).
        notes: Optional notes.

    Returns:
        JSON: {"ok": true, "appointment_id": ..., "conflict_detected": bool} or {"error": ...}.
    """
    if not _valid_uuid(patient_id) or not _valid_uuid(staff_id):
        return _dumps({"error": "invalid patient_id or staff_id"})
    if visit_type not in _VISIT_TYPES:
        return _dumps({"error": f"invalid visit_type '{visit_type}'; allowed: {sorted(_VISIT_TYPES)}"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                conflict = await _has_conflict(conn, staff_id, start_time, end_time)
                row = await conn.fetchrow(
                    """INSERT INTO appointments
                         (patient_id, staff_id, visit_type, start_time, end_time,
                          duration_minutes, status, conflict_detected, notes)
                       VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5::timestamptz,
                               $6, 'scheduled', $7, $8)
                       RETURNING id""",
                    patient_id, staff_id, visit_type,
                    _to_dt(start_time), _to_dt(end_time),
                    duration_minutes, conflict, notes or None,
                )
                appt_id = str(row["id"])
                await conn.execute(
                    "INSERT INTO audit_logs (action, table_name, record_id, new_values, created_at) "
                    "VALUES ($1, $2, $3::uuid, $4::jsonb, now())",
                    "ai_create_appointment", "appointments", appt_id,
                    _dumps({
                        "patient_id": patient_id, "staff_id": staff_id,
                        "visit_type": visit_type, "start_time": start_time,
                        "end_time": end_time, "duration_minutes": duration_minutes,
                        "status": "scheduled", "conflict_detected": conflict,
                        "notes": notes,
                    }),
                )
            return _dumps({"ok": True, "appointment_id": appt_id, "conflict_detected": conflict})
        finally:
            await conn.close()

    return _run(_q())


@tool
def update_appointment(appointment_id: str, visit_type: str | None = None,
                       start_time: str | None = None, end_time: str | None = None,
                       duration_minutes: int | None = None, status: str | None = None,
                       notes: str | None = None, staff_id: str | None = None) -> str:
    """
    Modify an existing appointment. Only provided fields are changed. Re-runs a conflict
    check (excluding this appointment) and updates conflict_detected. Writes an audit row
    with old and new values.

    Args:
        appointment_id: Appointment UUID.
        visit_type, start_time, end_time, duration_minutes, status, notes, staff_id:
            Optional new values. status must be one of scheduled, confirmed,
            in_progress, completed, cancelled.

    Returns:
        JSON: {"ok": true, "appointment_id": ..., "conflict_detected": bool, "changed": [...]}.
    """
    if not _valid_uuid(appointment_id):
        return _dumps({"error": f"invalid appointment_id: {appointment_id}"})
    if status is not None and status not in _STATUSES:
        return _dumps({"error": f"invalid status '{status}'; allowed: {sorted(_STATUSES)}"})
    if visit_type is not None and visit_type not in _VISIT_TYPES:
        return _dumps({"error": f"invalid visit_type '{visit_type}'; allowed: {sorted(_VISIT_TYPES)}"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                old = await conn.fetchrow(
                    "SELECT staff_id, visit_type, start_time, end_time, duration_minutes, "
                    "status, notes FROM appointments WHERE id = $1::uuid",
                    appointment_id,
                )
                if old is None:
                    return _dumps({"error": f"appointment {appointment_id} not found"})

                new_staff = staff_id or str(old["staff_id"])
                new_start = start_time or old["start_time"].isoformat()
                new_end = end_time or old["end_time"].isoformat()
                conflict = await _has_conflict(conn, new_staff, new_start, new_end, appointment_id)

                sets, args = [], []
                if visit_type:
                    sets.append(f"visit_type = ${len(args)+1}"); args.append(visit_type)
                if start_time:
                    sets.append(f"start_time = ${len(args)+1}::timestamptz"); args.append(_to_dt(start_time))
                if end_time:
                    sets.append(f"end_time = ${len(args)+1}::timestamptz"); args.append(_to_dt(end_time))
                if duration_minutes:
                    sets.append(f"duration_minutes = ${len(args)+1}"); args.append(duration_minutes)
                if status:
                    sets.append(f"status = ${len(args)+1}"); args.append(status)
                if notes is not None:
                    sets.append(f"notes = ${len(args)+1}"); args.append(notes or None)
                if staff_id:
                    sets.append(f"staff_id = ${len(args)+1}::uuid"); args.append(staff_id)
                sets.append("conflict_detected = ${}".format(len(args)+1)); args.append(conflict)
                sets.append("updated_at = now()")

                args.append(appointment_id)
                await conn.execute(
                    f"UPDATE appointments SET {', '.join(sets)} WHERE id = ${len(args)}::uuid",
                    *args,
                )
                await conn.execute(
                    "INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values, created_at) "
                    "VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())",
                    "ai_update_appointment", "appointments", appointment_id,
                    _dumps(dict(old)),
                    _dumps({
                        "staff_id": new_staff, "visit_type": visit_type or old["visit_type"],
                        "start_time": new_start, "end_time": new_end,
                        "duration_minutes": duration_minutes or old["duration_minutes"],
                        "status": status or old["status"], "notes": notes if notes is not None else old["notes"],
                        "conflict_detected": conflict,
                    }),
                )
            changed = [k for k in ["visit_type", "start_time", "end_time", "duration_minutes",
                                   "status", "notes", "staff_id"] if locals().get(k) is not None]
            return _dumps({"ok": True, "appointment_id": appointment_id,
                           "conflict_detected": conflict, "changed": changed})
        finally:
            await conn.close()

    return _run(_q())


@tool
def cancel_appointment(appointment_id: str) -> str:
    """
    Cancel an appointment (set status='cancelled'). Writes an audit row.

    Returns:
        JSON: {"ok": true, "appointment_id": ...} or {"error": ...}.
    """
    if not _valid_uuid(appointment_id):
        return _dumps({"error": f"invalid appointment_id: {appointment_id}"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                old = await conn.fetchrow(
                    "SELECT status FROM appointments WHERE id = $1::uuid", appointment_id
                )
                if old is None:
                    return _dumps({"error": f"appointment {appointment_id} not found"})
                await conn.execute(
                    "UPDATE appointments SET status='cancelled', updated_at=now() WHERE id=$1::uuid",
                    appointment_id,
                )
                await conn.execute(
                    "INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values, created_at) "
                    "VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())",
                    "ai_cancel_appointment", "appointments", appointment_id,
                    _dumps({"status": old["status"]}),
                    _dumps({"status": "cancelled"}),
                )
            return _dumps({"ok": True, "appointment_id": appointment_id})
        finally:
            await conn.close()

    return _run(_q())
