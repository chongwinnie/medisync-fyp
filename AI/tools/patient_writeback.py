"""Patient write-back tools — create/update patient records from chat (Patient Agent agent).

Mirrors application/lib/actions/patients.ts:
- create: doctor / nurse / admin (New Admission + Add Patient)
- update basics: doctor / admin (nurse denied at the agent layer)

Every write inserts an audit_logs row in the same transaction.
"""
from __future__ import annotations

import asyncio
import json
import random
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from langchain_core.tools import tool

from db.postgres import apg_connect

_GENDERS = {"male", "female", "other", "unknown"}
_STATUSES = {"outpatient", "admitted", "discharged", "inactive"}


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


def _normalize_dob(value: str) -> str | None:
    """Accept YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, DD/MM/YYYY."""
    raw = (value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    # Compact YYYYMMDD
    if re.fullmatch(r"\d{8}", raw):
        try:
            return datetime.strptime(raw, "%Y%m%d").date().isoformat()
        except ValueError:
            return None
    return None


def _normalize_gender(value: str) -> str | None:
    g = (value or "").strip().lower()
    aliases = {
        "f": "female",
        "m": "male",
        "woman": "female",
        "man": "male",
        "non-binary": "other",
        "nonbinary": "other",
    }
    g = aliases.get(g, g)
    return g if g in _GENDERS else None


def _generate_patient_code() -> str:
    return f"PT-{random.randint(1000, 9999)}"


@tool
def create_patient(
    full_name: str,
    date_of_birth: str,
    gender: str,
    patient_code: str = "",
    blood_type: str = "",
    phone: str = "",
    as_admission: bool = False,
    primary_doctor_id: str = "",
) -> str:
    """
    Create a new patient record in Postgres (same fields as New Admission / Add Patient UI).
    Allowed for doctor, nurse, and admin chat sessions. Auto-generates patient_code (PT-####)
    when omitted. Sets status=admitted and admitted_at when as_admission is true; otherwise
    outpatient.

    Args:
        full_name: Patient full name (required).
        date_of_birth: DOB as YYYY-MM-DD (also accepts YYYY.MM.DD).
        gender: male | female | other | unknown.
        patient_code: Optional PT-####; auto-generated if blank.
        blood_type: Optional blood type string (e.g. A+).
        phone: Optional phone.
        as_admission: If true, create as admitted (New Admission).
        primary_doctor_id: Optional staff UUID for primary doctor.

    Returns:
        JSON: {"ok": true, "id": ..., "patient_code": ..., "status": ...} or {"error": ...}.
    """
    name = (full_name or "").strip()
    if not name:
        return _dumps({"error": "full_name is required"})
    dob = _normalize_dob(date_of_birth)
    if not dob:
        return _dumps({"error": f"invalid date_of_birth: {date_of_birth}"})
    g = _normalize_gender(gender)
    if not g:
        return _dumps({"error": f"invalid gender '{gender}'; allowed: {sorted(_GENDERS)}"})
    if primary_doctor_id and not _valid_uuid(primary_doctor_id):
        return _dumps({"error": f"invalid primary_doctor_id: {primary_doctor_id}"})

    code = (patient_code or "").strip().upper() or _generate_patient_code()
    if not re.fullmatch(r"PT-\d+", code):
        return _dumps({"error": f"invalid patient_code '{code}'; expected PT-####"})

    bt = (blood_type or "").strip() or None
    ph = (phone or "").strip() or None
    doctor_id = primary_doctor_id.strip() if primary_doctor_id else None
    status = "admitted" if as_admission else "outpatient"
    dob_date = date.fromisoformat(dob)

    async def _q() -> str:
        conn = await apg_connect()
        try:
            for _attempt in range(5):
                use_code = code if _attempt == 0 else _generate_patient_code()
                try:
                    async with conn.transaction():
                        row = await conn.fetchrow(
                            """
                            INSERT INTO patients
                              (patient_code, full_name, date_of_birth, gender, blood_type,
                               phone, primary_doctor_id, status, admitted_at)
                            VALUES (
                              $1, $2, $3::date, $4::gender_type, $5, $6,
                              $7::uuid, $8::patient_status,
                              CASE WHEN $8::patient_status = 'admitted' THEN now() ELSE NULL END
                            )
                            RETURNING id, patient_code, status, full_name, date_of_birth, gender
                            """,
                            use_code,
                            name,
                            dob_date,
                            g,
                            bt,
                            ph,
                            doctor_id,
                            status,
                        )
                        await conn.execute(
                            """
                            INSERT INTO audit_logs
                              (action, table_name, record_id, old_values, new_values, created_at)
                            VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())
                            """,
                            "ai_create_patient",
                            "patients",
                            row["id"],
                            _dumps({}),
                            _dumps(dict(row)),
                        )
                    return _dumps(
                        {
                            "ok": True,
                            "id": str(row["id"]),
                            "patient_code": row["patient_code"],
                            "full_name": row["full_name"],
                            "status": str(row["status"]),
                            "date_of_birth": row["date_of_birth"].isoformat()
                            if hasattr(row["date_of_birth"], "isoformat")
                            else str(row["date_of_birth"]),
                            "gender": str(row["gender"]),
                        }
                    )
                except Exception as exc:
                    msg = str(exc).lower()
                    if "unique" in msg or "duplicate" in msg:
                        continue
                    return _dumps({"error": str(exc)})
            return _dumps({"error": "could not allocate a unique patient_code; retry"})
        finally:
            await conn.close()

    return _run(_q())


@tool
def update_patient(
    patient_id: str,
    full_name: str = "",
    date_of_birth: str = "",
    gender: str = "",
    blood_type: str = "",
    phone: str = "",
    status: str = "",
) -> str:
    """
    Update basic patient demographics. Intended for doctor/admin (nurse denied by Patient Agent agent).
    Only provided non-empty fields are changed.

    Args:
        patient_id: Patient UUID.
        full_name / date_of_birth / gender / blood_type / phone / status: optional fields.

    Returns:
        JSON: {"ok": true, "patient_id": ..., "updated": [...]} or {"error": ...}.
    """
    if not _valid_uuid(patient_id):
        return _dumps({"error": f"invalid patient_id: {patient_id}"})

    fields: dict = {}
    if full_name.strip():
        fields["full_name"] = full_name.strip()
    if date_of_birth.strip():
        dob = _normalize_dob(date_of_birth)
        if not dob:
            return _dumps({"error": f"invalid date_of_birth: {date_of_birth}"})
        fields["date_of_birth"] = date.fromisoformat(dob)
    if gender.strip():
        g = _normalize_gender(gender)
        if not g:
            return _dumps({"error": f"invalid gender '{gender}'"})
        fields["gender"] = g
    if blood_type != "":
        fields["blood_type"] = blood_type.strip() or None
    if phone != "":
        fields["phone"] = phone.strip() or None
    if status.strip():
        if status.strip() not in _STATUSES:
            return _dumps({"error": f"invalid status '{status}'"})
        fields["status"] = status.strip()

    if not fields:
        return _dumps({"error": "no fields to update"})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            async with conn.transaction():
                old = await conn.fetchrow(
                    "SELECT id, full_name, date_of_birth, gender, blood_type, phone, status "
                    "FROM patients WHERE id = $1::uuid",
                    patient_id,
                )
                if old is None:
                    return _dumps({"error": f"patient {patient_id} not found"})

                sets = []
                args = []
                for i, (col, val) in enumerate(fields.items(), start=1):
                    if col == "date_of_birth":
                        sets.append(f"{col} = ${i}::date")
                    elif col == "gender":
                        sets.append(f"{col} = ${i}::gender_type")
                    elif col == "status":
                        sets.append(f"{col} = ${i}::patient_status")
                    else:
                        sets.append(f"{col} = ${i}")
                    args.append(val)
                args.append(patient_id)
                await conn.execute(
                    f"UPDATE patients SET {', '.join(sets)}, updated_at = now() "
                    f"WHERE id = ${len(args)}::uuid",
                    *args,
                )
                await conn.execute(
                    """
                    INSERT INTO audit_logs
                      (action, table_name, record_id, old_values, new_values, created_at)
                    VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, now())
                    """,
                    "ai_update_patient",
                    "patients",
                    patient_id,
                    _dumps({k: old[k] for k in ("full_name", "date_of_birth", "gender",
                                                  "blood_type", "phone", "status")}),
                    _dumps(fields),
                )
            return _dumps({"ok": True, "patient_id": patient_id, "updated": list(fields.keys())})
        finally:
            await conn.close()

    return _run(_q())
