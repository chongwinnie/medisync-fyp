"""Billing write tools — create and update invoices in Postgres."""
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


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=30)


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
        patient_id: UUID of the patient.
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
            row = await conn.fetchrow(
                """
                INSERT INTO invoices
                  (patient_id, appointment_id, created_by, line_items,
                   subtotal, tax, total_amount, due_date, notes)
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
                RETURNING id, invoice_number, status, total_amount, created_at
                """,
                patient_id,
                appointment_id,
                created_by_staff_id,
                json.dumps(line_items),
                subtotal,
                tax,
                total,
                date.fromisoformat(due_date) if due_date else None,
                notes,
            )
        finally:
            await conn.close()
        return json.dumps(dict(row), default=_json_default)

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
        finally:
            await conn.close()
        if not row:
            return json.dumps({"error": f"Invoice {invoice_id} not found."})
        return json.dumps(dict(row), default=_json_default)

    return _run(_q())
