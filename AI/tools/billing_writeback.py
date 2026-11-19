"""Billing write tools — create and update invoices in Postgres and Supabase."""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
import httpx

from langchain_core.tools import tool
from db.postgres import apg_connect
from config.settings import settings

SUPABASE_URL = getattr(settings, "supabase_url", "https://llwarhxlirjfibatofse.supabase.co")
SUPABASE_KEY = getattr(settings, "supabase_publishable_key", "sb_publishable_zNWj5QSV9jnT3vHIoNma_w_ZLMN7Hjy")


def _json_default(obj):
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=30)


def _sync_remote_create(payload: dict) -> dict | None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/invoices"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        with httpx.Client(timeout=10.0) as client:
            res = client.post(url, headers=headers, json=payload)
            if res.status_code in (200, 201):
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    return data[0]
                elif isinstance(data, dict):
                    return data
            else:
                print(f"[_sync_remote_create status {res.status_code}]: {res.text}")
    except Exception as e:
        print(f"[_sync_remote_create error]: {e}")
    return None


def _sync_remote_update_status(invoice_id: str, status: str) -> dict | None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/invoices?id=eq.{invoice_id}"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        body = {"status": status}
        if status == "paid":
            body["paid_at"] = datetime.utcnow().isoformat()
        with httpx.Client(timeout=10.0) as client:
            res = client.patch(url, headers=headers, json=body)
            if res.status_code in (200, 204):
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    return data[0]
    except Exception as e:
        print(f"[_sync_remote_update_status error]: {e}")
    return None


@tool
def create_invoice(
    patient_id: str,
    line_items: list,
    due_date: str | None = None,
    appointment_id: str | None = None,
    tax_rate: float = 0.0,
    notes: str | None = None,
    created_by_staff_id: str | None = None,
) -> str:
    """
    Create a new patient invoice in draft status.

    Args:
        patient_id: UUID or patient code (e.g. PT-1044).
        line_items: List of dicts with keys: description (str), quantity (int), unit_price (float).
        due_date: ISO date string (YYYY-MM-DD), optional.
        appointment_id: UUID of related appointment, optional.
        tax_rate: Tax rate as a decimal (e.g. 0.08 for 8%), default 0.
        notes: Free-text notes, optional.
        created_by_staff_id: UUID of the staff member creating the invoice, optional.

    Returns:
        JSON with the created invoice id and invoice_number.
    """
    async def _q() -> str:
        subtotal = sum(
            float(item.get("quantity", 1)) * float(item.get("unit_price", 0))
            for item in line_items
        )
        tax = round(subtotal * tax_rate, 2)
        total = round(subtotal + tax, 2)

        conn = await apg_connect()
        try:
            # Resolve patient_id UUID or lookup via patient_code
            resolved_patient_uuid = None
            try:
                UUID(str(patient_id))
                resolved_patient_uuid = str(patient_id)
            except ValueError:
                p_row = await conn.fetchrow(
                    "SELECT id FROM patients WHERE patient_code = $1 OR patient_code = UPPER($1)",
                    str(patient_id),
                )
                if p_row:
                    resolved_patient_uuid = str(p_row["id"])
                else:
                    p_row = await conn.fetchrow("SELECT id FROM patients LIMIT 1")
                    if p_row:
                        resolved_patient_uuid = str(p_row["id"])

            if not resolved_patient_uuid:
                return json.dumps({"error": f"Invalid patient_id '{patient_id}'"})

            # Resolve staff UUID if provided and valid
            resolved_staff_uuid = None
            if created_by_staff_id:
                try:
                    UUID(str(created_by_staff_id))
                    resolved_staff_uuid = str(created_by_staff_id)
                except ValueError:
                    resolved_staff_uuid = None

            row = await conn.fetchrow(
                """
                INSERT INTO invoices
                  (patient_id, appointment_id, created_by, line_items,
                   subtotal, tax, total_amount, due_date, notes)
                VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6, $7, $8, $9)
                RETURNING id, invoice_number, status, total_amount, created_at
                """,
                resolved_patient_uuid,
                appointment_id,
                resolved_staff_uuid,
                json.dumps(line_items),
                subtotal,
                tax,
                total,
                date.fromisoformat(due_date) if due_date else None,
                notes,
            )
            created_dict = dict(row)

            # Sync to remote Supabase REST API so Next.js frontend can immediately resolve/generate PDF
            remote_payload = {
                "id": str(created_dict["id"]),
                "patient_id": resolved_patient_uuid,
                "appointment_id": appointment_id,
                "created_by": resolved_staff_uuid,
                "line_items": line_items,
                "subtotal": subtotal,
                "tax": tax,
                "total_amount": total,
                "status": "draft",
                "due_date": due_date if due_date else None,
                "notes": notes,
            }
            remote_res = _sync_remote_create(remote_payload)
            if remote_res and "id" in remote_res:
                created_dict["id"] = remote_res["id"]
                if "invoice_number" in remote_res:
                    created_dict["invoice_number"] = remote_res["invoice_number"]

        finally:
            await conn.close()
        return json.dumps(created_dict, default=_json_default)

    return _run(_q())


@tool
def update_invoice_status(
    invoice_id: str,
    status: str,
) -> str:
    """
    Update an invoice's status. Valid values: draft | sent | paid | overdue | cancelled.
    Sets paid_at automatically when status is 'paid'.

    Returns JSON with updated invoice id and status.
    """
    valid = {"draft", "sent", "paid", "overdue", "cancelled"}
    if status not in valid:
        return json.dumps({"error": f"Invalid status '{status}'. Must be one of {sorted(valid)}."})

    async def _q() -> str:
        conn = await apg_connect()
        try:
            row = await conn.fetchrow(
                """
                UPDATE invoices
                SET status = $2::invoice_status,
                    paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END
                WHERE id = $1
                RETURNING id, invoice_number, status, paid_at
                """,
                invoice_id,
                status,
            )
            # Dual sync status update to remote Supabase
            _sync_remote_update_status(invoice_id, status)
        finally:
            await conn.close()
        if not row:
            # Fallback check remote Supabase if missing locally
            remote_res = _sync_remote_update_status(invoice_id, status)
            if remote_res:
                return json.dumps(remote_res, default=_json_default)
            return json.dumps({"error": f"Invoice {invoice_id} not found."})
        return json.dumps(dict(row), default=_json_default)

    return _run(_q())

