"""Billing data read tools — query invoices from Postgres."""
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
def get_patient_invoices(patient_id: str, status: str | None = None) -> str:
    """
    List invoices for a patient. Optionally filter by status
    (draft | sent | paid | overdue | cancelled).

    Returns JSON list of invoice records.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            where = "WHERE i.patient_id = $1"
            args = [patient_id]
            if status:
                where += " AND i.status = $2"
                args.append(status)
            rows = await conn.fetch(
                f"""
                SELECT i.id, i.invoice_number, i.status, i.subtotal, i.tax,
                       i.total_amount, i.due_date, i.paid_at, i.notes,
                       i.created_at, i.line_items,
                       p.full_name AS patient_name, p.patient_code
                FROM invoices i
                JOIN patients p ON p.id = i.patient_id
                {where}
                ORDER BY i.created_at DESC
                LIMIT 50
                """,
                *args,
            )
        finally:
            await conn.close()
        return json.dumps([dict(r) for r in rows], default=_json_default)

    return _run(_q())


@tool
def get_invoice_summary() -> str:
    """
    Return aggregate billing stats: total outstanding amount, overdue count,
    paid this month, draft count.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            row = await conn.fetchrow(
                """
                SELECT
                  COUNT(*) FILTER (WHERE status IN ('sent','overdue')) AS outstanding_count,
                  COALESCE(SUM(total_amount) FILTER (WHERE status IN ('sent','overdue')), 0) AS outstanding_amount,
                  COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
                  COUNT(*) FILTER (WHERE status = 'paid'
                    AND date_trunc('month', paid_at) = date_trunc('month', now())) AS paid_this_month,
                  COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'
                    AND date_trunc('month', paid_at) = date_trunc('month', now())), 0) AS revenue_this_month,
                  COUNT(*) FILTER (WHERE status = 'draft') AS draft_count
                FROM invoices
                """
            )
        finally:
            await conn.close()
        return json.dumps(dict(row), default=_json_default)

    return _run(_q())
