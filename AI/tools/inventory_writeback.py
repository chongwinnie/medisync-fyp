"""Inventory write-back — bed allocation from chat (IA agent).

Mirrors application/lib/actions/inventory.ts allocateBedAction.
Role gate (nurse + admin) is enforced by the Inventory agent / supervisor;
doctors cannot reach IA. Stock adjustments remain UI/admin-only (not exposed here).
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


def _valid_uuid(value) -> bool:
    try:
        UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


@tool
def allocate_bed(
    patient_id: str,
    room_id: str,
    bed_number: int = 1,
    special_requirements: str = "",
) -> str:
    """
    Allocate a bed to a patient: creates bed_allocations, marks patient admitted,
    sets room occupied. Nurse and admin only (enforced by agent). Clears any prior
    active bed for the patient.

    Args:
        patient_id: Patient UUID.
        room_id: Room UUID (from get_rooms_status).
        bed_number: Bed number in the room (>=1). Default 1.
        special_requirements: Optional notes.

    Returns:
        JSON: {"ok": true, "allocation_id": ..., "patient_code": ..., "room": ...}
        or {"error": ...}.
    """
    if not _valid_uuid(patient_id) or not _valid_uuid(room_id):
        return _dumps({"error": "invalid patient_id or room_id"})
    bed = int(bed_number)
    if bed < 1:
        return _dumps({"error": "bed_number must be >= 1"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                patient = await conn.fetchrow(
                    "SELECT id, patient_code, full_name, status FROM patients WHERE id = $1::uuid",
                    patient_id,
                )
                if patient is None:
                    return _dumps({"error": f"patient {patient_id} not found"})
                room = await conn.fetchrow(
                    "SELECT id, room_number, ward, bed_count, status FROM rooms WHERE id = $1::uuid",
                    room_id,
                )
                if room is None:
                    return _dumps({"error": f"room {room_id} not found"})
                if bed > int(room["bed_count"] or 1):
                    return _dumps(
                        {
                            "error": (
                                f"bed_number {bed} exceeds room bed_count "
                                f"{room['bed_count']}"
                            )
                        }
                    )
                taken = await conn.fetchval(
                    """
                    SELECT EXISTS(
                      SELECT 1 FROM bed_allocations
                      WHERE room_id = $1::uuid AND bed_number = $2 AND is_active = true
                    )
                    """,
                    room_id,
                    bed,
                )
                if taken:
                    return _dumps({"error": f"bed {bed} in room already occupied"})

                await conn.execute(
                    """
                    UPDATE bed_allocations SET is_active = false, updated_at = now()
                    WHERE patient_id = $1::uuid AND is_active = true
                    """,
                    patient_id,
                )
                row = await conn.fetchrow(
                    """
                    INSERT INTO bed_allocations
                      (room_id, patient_id, bed_number, admission_date,
                       special_requirements, is_active)
                    VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, $4, true)
                    RETURNING id
                    """,
                    room_id,
                    patient_id,
                    bed,
                    special_requirements.strip() or None,
                )
                await conn.execute(
                    """
                    UPDATE patients
                    SET status = 'admitted', admitted_at = COALESCE(admitted_at, now()),
                        updated_at = now()
                    WHERE id = $1::uuid
                    """,
                    patient_id,
                )
                await conn.execute(
                    "UPDATE rooms SET status = 'occupied', updated_at = now() WHERE id = $1::uuid",
                    room_id,
                )
                await conn.execute(
                    """
                    INSERT INTO audit_logs
                      (action, table_name, record_id, old_values, new_values, created_at)
                    VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())
                    """,
                    "ai_allocate_bed",
                    "bed_allocations",
                    row["id"],
                    _dumps({}),
                    _dumps(
                        {
                            "patient_id": patient_id,
                            "room_id": room_id,
                            "bed_number": bed,
                            "patient_code": patient["patient_code"],
                        }
                    ),
                )
            return _dumps(
                {
                    "ok": True,
                    "allocation_id": str(row["id"]),
                    "patient_id": patient_id,
                    "patient_code": patient["patient_code"],
                    "patient_name": patient["full_name"],
                    "room_number": room["room_number"],
                    "ward": room["ward"],
                    "bed_number": bed,
                }
            )
        finally:
            await conn.close()

    return _run(_q())
