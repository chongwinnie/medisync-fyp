"""Billing REST endpoints — invoice CRUD (Operation staff / Admin)."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

ALLOWED_ROLES = {"admin", "staff", "nurse", "doctor"}


def _role_check(request: Request) -> str | None:
    role = getattr(request.state, "user_role", "doctor")
    if role not in ALLOWED_ROLES:
        return role
    return None


class CreateInvoiceRequest(BaseModel):
    patient_id: str
    line_items: list
    due_date: str | None = None
    appointment_id: str | None = None
    tax_rate: float = 0.0
    notes: str | None = None


class UpdateStatusRequest(BaseModel):
    status: str


@router.get("/billing/invoices")
async def list_invoices(request: Request, patient_id: str | None = None, status: str | None = None):
    """List invoices. Operation staff / Admin only."""
    denied = _role_check(request)
    if denied:
        return JSONResponse({"error": f"Role '{denied}' cannot access billing."}, status_code=403)

    from tools.billing_data import get_invoice_summary, get_patient_invoices

    if patient_id:
        result = get_patient_invoices.invoke({"patient_id": patient_id, "status": status})
    else:
        # No patient_id: return summary stats
        result = get_invoice_summary.invoke({})
    return JSONResponse({"data": result})


@router.post("/billing/invoices")
async def create_invoice(request: Request, body: CreateInvoiceRequest):
    """Create a new invoice. Operation staff / Admin only."""
    denied = _role_check(request)
    if denied:
        return JSONResponse({"error": f"Role '{denied}' cannot create invoices."}, status_code=403)

    user_id = getattr(request.state, "user_id", None)
    from tools.billing_writeback import create_invoice as _create

    result = _create.invoke({
        "patient_id": body.patient_id,
        "line_items": body.line_items,
        "due_date": body.due_date,
        "appointment_id": body.appointment_id,
        "tax_rate": body.tax_rate,
        "notes": body.notes,
        "created_by_staff_id": user_id,
    })
    return JSONResponse({"data": result}, status_code=201)


@router.patch("/billing/invoices/{invoice_id}/status")
async def update_status(request: Request, invoice_id: str, body: UpdateStatusRequest):
    """Update invoice status. Operation staff / Admin only."""
    denied = _role_check(request)
    if denied:
        return JSONResponse({"error": f"Role '{denied}' cannot update invoices."}, status_code=403)

    from tools.billing_writeback import update_invoice_status

    result = update_invoice_status.invoke({"invoice_id": invoice_id, "status": body.status})
    return JSONResponse({"data": result})


@router.get("/billing/summary")
async def billing_summary(request: Request):
    """Aggregate billing stats. Operation staff / Admin only."""
    denied = _role_check(request)
    if denied:
        return JSONResponse({"error": f"Role '{denied}' cannot access billing."}, status_code=403)

    from tools.billing_data import get_invoice_summary
    result = get_invoice_summary.invoke({})
    return JSONResponse({"data": result})
