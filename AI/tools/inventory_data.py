"""Read-only Postgres query tools for the Inventory & Resource Agent.

Lets the agent read inventory items, active alerts, and room/bed status from
Postgres (the system of record). All queries are read-only; writes/adjustments
are clinician/admin actions performed via the frontend.
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
def get_inventory_items(
    category: str | None = None,
    low_stock_only: bool = False,
    expiring_within_days: int | None = None,
    limit: int = 100,
) -> str:
    """
    Fetch inventory items from Postgres with optional filtering. Use this to
    answer stock queries, low-stock scans, and expiry checks.

    Args:
        category: Optional inventory_category filter: 'medicine', 'supply',
            'equipment', 'consumable', 'other'. Omit to list all.
        low_stock_only: If true, return only items where current_stock <=
            minimum_level.
        expiring_within_days: If set, return only items whose expiry_date falls
            within this many days from today (and is not null).
        limit: Max rows (default 100, capped at 500).

    Returns:
        JSON array: id, sku, item_name, category, current_stock, minimum_level,
        reorder_quantity, unit, supplier_name, expiry_date, unit_cost, status,
        days_until_expiry (null when no expiry_date).
    """
    limit = max(1, min(int(limit), 500))

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT id, sku, item_name, category, current_stock, minimum_level,
                       reorder_quantity, unit, supplier_name, expiry_date, unit_cost,
                       status,
                       CASE WHEN expiry_date IS NULL THEN NULL
                            ELSE (expiry_date - CURRENT_DATE)::int END AS days_until_expiry
                FROM inventory_items
                WHERE ($1::inventory_category IS NULL OR category = $1::inventory_category)
                  AND ($2::bool IS FALSE OR current_stock <= minimum_level)
                  AND ($3::int IS NULL OR (
                        expiry_date IS NOT NULL
                        AND expiry_date <= CURRENT_DATE + make_interval(days => $3)))
                ORDER BY
                  CASE WHEN current_stock <= minimum_level THEN 0 ELSE 1 END,
                  expiry_date NULLS LAST,
                  item_name
                LIMIT $4
                """,
                category if category else None,
                bool(low_stock_only),
                int(expiring_within_days) if expiring_within_days is not None else None,
                limit,
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_inventory_alerts(active_only: bool = True) -> str:
    """
    Fetch inventory alerts (low_stock, expiry, reorder, other) from Postgres.

    Args:
        active_only: If true (default), return only alerts where is_dismissed is
            false.

    Returns:
        JSON array: id, item_id, item_name, sku, alert_type, severity, message,
        is_dismissed, triggered_at.
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT a.id, a.item_id, i.item_name, i.sku, a.alert_type,
                       a.severity, a.message, a.is_dismissed, a.triggered_at
                FROM inventory_alerts a
                JOIN inventory_items i ON i.id = a.item_id
                WHERE ($1::bool IS FALSE OR a.is_dismissed = FALSE)
                ORDER BY
                  CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  a.triggered_at DESC
                """,
                bool(active_only),
            )
            return _to_json(rows)
        finally:
            await conn.close()

    return _run(_q())


@tool
def get_rooms_status(status: str | None = None) -> str:
    """
    Fetch rooms and their active bed allocations from Postgres. Use this to
    answer "how many beds/rooms are available" and to find a free room.

    Args:
        status: Optional room_status filter: 'available', 'occupied',
            'maintenance', 'closed'. Omit to list all rooms.

    Returns:
        JSON array: id, room_number, ward, room_type, bed_count, status,
        special_equipment, active_allocations (array of patient_name, bed_number,
        admission_date, expected_discharge).
    """
    async def _q() -> str:
        conn = await apg_connect()
        try:
            rooms = await conn.fetch(
                """
                SELECT id, room_number, ward, room_type, bed_count, status,
                       special_equipment
                FROM rooms
                WHERE ($1::room_status IS NULL OR status = $1::room_status)
                ORDER BY ward, room_number
                """,
                status if status else None,
            )
            result = []
            for room in rooms:
                allocs = await conn.fetch(
                    """SELECT p.full_name AS patient_name, b.bed_number,
                              b.admission_date, b.expected_discharge
                       FROM bed_allocations b
                       JOIN patients p ON p.id = b.patient_id
                       WHERE b.room_id = $1::uuid AND b.is_active = true
                       ORDER BY b.bed_number""",
                    room["id"],
                )
                room_dict = dict(room)
                room_dict["active_allocations"] = [dict(a) for a in allocs]
                result.append(room_dict)
            return json.dumps(result, ensure_ascii=False, default=_json_default)
        finally:
            await conn.close()

    return _run(_q())
