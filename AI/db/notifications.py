"""In-app notification helpers for autonomous Celery / ops paths."""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

logger = logging.getLogger("medisync.notifications")

VALID_TYPES = frozenset({"system", "appointment", "inventory", "clinical", "staff"})


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result(timeout=30)


async def _notify_roles_async(
    *,
    roles: list[str],
    ntype: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> int:
    from db.postgres import apg_connect

    if ntype not in VALID_TYPES:
        ntype = "system"

    record_id: str | None = None
    if entity_id:
        try:
            record_id = str(UUID(str(entity_id)))
        except (ValueError, AttributeError, TypeError):
            record_id = None

    conn = await apg_connect()
    try:
        user_ids = await conn.fetch(
            "SELECT id FROM users WHERE role = ANY($1::user_role[]) AND is_active = true",
            roles,
        )
        if not user_ids:
            return 0

        now = datetime.now(timezone.utc)
        written = 0
        for row in user_ids:
            await conn.execute(
                """
                INSERT INTO notifications
                    (user_id, type, title, body, entity_type, entity_id, is_read, created_at, updated_at)
                VALUES
                    ($1, $2::notification_type, $3, $4, $5, $6::uuid, false, $7, $7)
                """,
                row["id"],
                ntype,
                title[:200],
                body[:2000],
                entity_type,
                record_id,
                now,
            )
            written += 1
        return written
    finally:
        await conn.close()


def notify_roles(
    *,
    roles: list[str],
    ntype: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> int:
    """Insert one notification per active user in the given roles. Returns count written."""
    try:
        return int(
            _run_async(
                _notify_roles_async(
                    roles=roles,
                    ntype=ntype,
                    title=title,
                    body=body,
                    entity_type=entity_type,
                    entity_id=entity_id,
                )
            )
        )
    except Exception as exc:
        logger.warning("notify_roles failed (non-fatal): %s", exc)
        return 0


def notify_admins(
    *,
    ntype: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> int:
    return notify_roles(
        roles=["admin"],
        ntype=ntype,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
    )


async def sync_low_stock_alerts_async() -> dict[str, Any]:
    """Scan inventory, refresh low_stock alerts, notify admins once if any remain."""
    from db.postgres import apg_connect

    conn = await apg_connect()
    try:
        low = await conn.fetch(
            """
            SELECT id, sku, item_name, current_stock, minimum_level
            FROM inventory_items
            WHERE status = 'active' AND current_stock <= minimum_level
            ORDER BY current_stock ASC
            LIMIT 50
            """
        )

        # Dismiss stale low_stock alerts for items now above minimum
        await conn.execute(
            """
            UPDATE inventory_alerts a
            SET is_dismissed = true,
                dismissed_at = now(),
                updated_at = now()
            FROM inventory_items i
            WHERE a.item_id = i.id
              AND a.alert_type = 'low_stock'
              AND a.is_dismissed = false
              AND i.current_stock > i.minimum_level
            """
        )

        created = 0
        for item in low:
            severity = "critical" if item["current_stock"] <= max(1, item["minimum_level"] // 2) else "warning"
            message = (
                f"Stock below minimum level "
                f"({item['current_stock']}/{item['minimum_level']})"
            )
            existing = await conn.fetchval(
                """
                SELECT id FROM inventory_alerts
                WHERE item_id = $1 AND alert_type = 'low_stock' AND is_dismissed = false
                LIMIT 1
                """,
                item["id"],
            )
            if existing:
                await conn.execute(
                    """
                    UPDATE inventory_alerts
                    SET severity = $2::alert_severity,
                        message = $3,
                        updated_at = now()
                    WHERE id = $1
                    """,
                    existing,
                    severity,
                    message,
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO inventory_alerts
                        (item_id, alert_type, severity, message, is_dismissed, triggered_at)
                    VALUES
                        ($1, 'low_stock', $2::alert_severity, $3, false, now())
                    """,
                    item["id"],
                    severity,
                    message,
                )
                created += 1

        notified = 0
        if low:
            names = ", ".join(f"{r['item_name']} ({r['current_stock']})" for r in low[:5])
            more = f" (+{len(low) - 5} more)" if len(low) > 5 else ""
            notified = await _notify_roles_async(
                roles=["admin"],
                ntype="inventory",
                title=f"Low stock: {len(low)} item(s)",
                body=f"Autonomous stock check flagged: {names}{more}. Review Inventory → Alerts.",
                entity_type="inventory_items",
                entity_id=str(low[0]["id"]) if low else None,
            )

        return {
            "status": "ok",
            "low_stock_count": len(low),
            "alerts_created": created,
            "notifications_written": notified,
        }
    finally:
        await conn.close()


def sync_low_stock_alerts() -> dict[str, Any]:
    try:
        return _run_async(sync_low_stock_alerts_async())
    except Exception as exc:
        logger.warning("sync_low_stock_alerts failed: %s", exc)
        return {"status": "error", "error": str(exc)}


async def scan_appointment_conflicts_async() -> dict[str, Any]:
    """Flag overlapping appointments for the same staff in the next 7 days."""
    from db.postgres import apg_connect

    conn = await apg_connect()
    try:
        conflicts = await conn.fetch(
            """
            SELECT a.id AS id_a, b.id AS id_b, a.staff_id, a.start_time
            FROM appointments a
            JOIN appointments b
              ON a.staff_id = b.staff_id
             AND a.id < b.id
             AND a.status NOT IN ('cancelled', 'no_show', 'completed')
             AND b.status NOT IN ('cancelled', 'no_show', 'completed')
             AND a.start_time < b.end_time
             AND b.start_time < a.end_time
             AND a.start_time >= now()
             AND a.start_time < now() + interval '7 days'
            LIMIT 25
            """
        )
        flagged = 0
        for row in conflicts:
            await conn.execute(
                "UPDATE appointments SET conflict_detected = true, updated_at = now() WHERE id = ANY($1::uuid[])",
                [row["id_a"], row["id_b"]],
            )
            flagged += 1

        notified = 0
        if conflicts:
            notified = await _notify_roles_async(
                roles=["admin"],
                ntype="appointment",
                title=f"Appointment conflicts: {len(conflicts)}",
                body=(
                    f"Autonomous conflict scan found {len(conflicts)} overlapping "
                    "appointment pair(s) in the next 7 days. Open Appointments to resolve."
                ),
                entity_type="appointments",
                entity_id=str(conflicts[0]["id_a"]),
            )

        return {
            "status": "ok",
            "conflict_pairs": len(conflicts),
            "flagged": flagged,
            "notifications_written": notified,
        }
    finally:
        await conn.close()


def scan_appointment_conflicts() -> dict[str, Any]:
    try:
        return _run_async(scan_appointment_conflicts_async())
    except Exception as exc:
        logger.warning("scan_appointment_conflicts failed: %s", exc)
        return {"status": "error", "error": str(exc)}


async def scan_shift_gaps_async() -> dict[str, Any]:
    """Detect dates in the next week with no night shift coverage."""
    from db.postgres import apg_connect

    conn = await apg_connect()
    try:
        gaps = await conn.fetch(
            """
            SELECT d::date AS gap_date
            FROM generate_series(
                CURRENT_DATE + 1,
                CURRENT_DATE + 7,
                interval '1 day'
            ) AS d
            WHERE NOT EXISTS (
                SELECT 1 FROM shift_schedules s
                WHERE s.shift_date = d::date
                  AND s.shift_type = 'night'
            )
            ORDER BY 1
            """
        )
        notified = 0
        if gaps:
            dates = ", ".join(str(r["gap_date"]) for r in gaps[:5])
            notified = await _notify_roles_async(
                roles=["admin"],
                ntype="staff",
                title=f"Night shift gaps: {len(gaps)} day(s)",
                body=f"Autonomous shift scan: no night coverage on {dates}. Open Staff → Shifts.",
                entity_type="shift_schedules",
            )

        return {
            "status": "ok",
            "gap_days": len(gaps),
            "notifications_written": notified,
        }
    finally:
        await conn.close()


def scan_shift_gaps() -> dict[str, Any]:
    try:
        return _run_async(scan_shift_gaps_async())
    except Exception as exc:
        logger.warning("scan_shift_gaps failed: %s", exc)
        return {"status": "error", "error": str(exc)}
