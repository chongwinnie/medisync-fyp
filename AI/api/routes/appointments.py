"""POST /appointments/notify — trigger AI appointment confirmation (second line)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class NotifyRequest(BaseModel):
    appointment_id: str


@router.post("/appointments/notify")
async def notify_appointment(request: NotifyRequest):
    """Enqueue the Appointment Scheduling agent to send the patient confirmation email."""
    from workers.tasks.appointment_tasks import send_appointment_confirmation

    task = send_appointment_confirmation.delay(request.appointment_id)
    return {
        "status": "queued",
        "appointment_id": request.appointment_id,
        "task_id": task.id,
        "message": "Appointment confirmation email enqueued to Appointment Agent agent",
    }
