"""Audit logging tool — writes structured audit records to PostgreSQL audit_logs table."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from langchain_core.tools import tool


@tool
def write_audit_log(
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict,
    user_id: str = "",
    table_name: str = "",
) -> str:
    """
    Write a structured audit record to the audit_logs table.

    Args:
        action: Description of the action (e.g., 'view_patient', 'draft_treatment_plan').
        entity_type: Type of the entity (e.g., 'patient', 'appointment').
        entity_id: UUID of the affected entity.
        details: Dict of additional context (new_values, old_values, agent_name, etc.).
        user_id: Auth0 sub of the acting user (empty for autonomous runs).
        table_name: Database table being affected.

    Returns:
        Confirmation string with timestamp.
    """
    import asyncio

    async def _write() -> str:
        try:
            from db.postgres import AsyncSessionLocal
            import sqlalchemy as sa
            from uuid import UUID

            # Coerce entity_id to a valid UUID or None. Agents may pass non-UUID
            # sentinels like "multiple" for batch actions; the audit_logs.record_id
            # column is uuid-typed, so invalid/empty values become NULL.
            record_id = None
            if entity_id:
                try:
                    record_id = str(UUID(str(entity_id)))
                except (ValueError, AttributeError, TypeError):
                    record_id = None

            now = datetime.now(timezone.utc)
            record = {
                "action": action,
                "table_name": table_name or entity_type,
                "record_id": record_id,
                "new_values": json.dumps(details),
                "created_at": now.isoformat(),
            }
            if user_id:
                record["user_id"] = user_id

            async with AsyncSessionLocal() as session:
                await session.execute(
                    sa.text(
                        "INSERT INTO audit_logs (action, table_name, record_id, new_values, created_at) "
                        "VALUES (:action, :table_name, CAST(:record_id AS uuid), "
                        "CAST(:new_values AS jsonb), CAST(:created_at AS timestamptz))"
                    ),
                    {
                        "action": action,
                        "table_name": record["table_name"],
                        "record_id": record_id,
                        "new_values": record["new_values"],
                        "created_at": now,
                    },
                )
                await session.commit()
            return f"audit_log written: {action} on {entity_type}/{entity_id} at {record['created_at']}"
        except Exception as exc:
            # Non-fatal: log to stderr and continue
            import sys
            print(f"[audit_logging] DB write failed (non-fatal): {exc}", file=sys.stderr)
            return f"audit_log skipped (DB unavailable): {action}"

    try:
        loop = asyncio.get_running_loop()
        # We're inside an async context; schedule the coroutine
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, _write())
            return future.result(timeout=5)
    except RuntimeError:
        return asyncio.run(_write())
