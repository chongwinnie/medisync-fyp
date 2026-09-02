"""Real-time clinical alert dispatch endpoints for Celery and AI agents."""
from __future__ import annotations

import asyncio
import logging
from typing import Any
import httpx
from fastapi import APIRouter, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config.settings import settings
from db.notifications import notify_roles

logger = logging.getLogger("medisync.alerts")
router = APIRouter(prefix="/alerts", tags=["Clinical Alerts"])


class BroadcastAlertRequest(BaseModel):
    category: str = Field(default="clinical_vitals", description="Alert category: clinical_vitals | clinical_diagnostic | emergency_bed | stock_low | system")
    severity: str = Field(default="critical", description="Severity: critical | warning | info")
    title: str
    message: str
    patient_id: str | None = None
    patient_code: str | None = None
    patient_name: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    action_url: str | None = None
    action_label: str | None = None
    target_roles: list[str] = Field(default_factory=lambda: ["doctor", "nurse", "admin"])
    persist: bool = True


async def _forward_to_nextjs_bus(payload: dict[str, Any]) -> None:
    """Forward alert to Next.js SSE bus."""
    nextjs_url = f"{settings.app_origin}/api/alerts/broadcast"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(nextjs_url, json=payload)
    except Exception as exc:
        logger.warning("Could not forward alert to Next.js SSE bus: %s", exc)


@router.post("/emit")
async def emit_clinical_alert(body: BroadcastAlertRequest, background_tasks: BackgroundTasks):
    """
    Emit a real-time clinical alert across active doctor/nurse sessions and write to Postgres.
    """
    payload = {
        "category": body.category,
        "severity": body.severity,
        "title": body.title,
        "message": body.message,
        "patientId": body.patient_id,
        "patientCode": body.patient_code,
        "patientName": body.patient_name,
        "entityType": body.entity_type,
        "entityId": body.entity_id,
        "actionUrl": body.action_url,
        "actionLabel": body.action_label,
        "targetRoles": body.target_roles,
        "persist": body.persist,
    }

    # 1. Forward to Next.js SSE Alert Bus in background
    background_tasks.add_task(_forward_to_nextjs_bus, payload)

    # 2. Write to DB if requested
    db_written = 0
    if body.persist:
        ntype_map = {
            "clinical_vitals": "clinical",
            "clinical_diagnostic": "clinical",
            "emergency_bed": "system",
            "stock_low": "inventory",
            "appointment_conflict": "appointment",
            "system": "system",
        }
        ntype = ntype_map.get(body.category, "system")
        db_written = notify_roles(
            roles=body.target_roles,
            ntype=ntype,
            title=body.title,
            body=body.message,
            entity_type=body.entity_type or ("patients" if body.patient_id else None),
            entity_id=body.entity_id or body.patient_id,
        )

    return JSONResponse({
        "status": "emitted",
        "category": body.category,
        "severity": body.severity,
        "notifications_written": db_written,
    })
