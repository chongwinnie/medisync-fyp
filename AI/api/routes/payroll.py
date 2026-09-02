"""POST /payroll/process — Stripe-backed payroll processing (Admin only)."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()


class ProcessPayrollRequest(BaseModel):
    payroll_id: str
    processed_by_staff_id: str | None = None


@router.post("/payroll/process")
async def process_payroll(request: Request, body: ProcessPayrollRequest):
    """Process one payroll row via Stripe. Admin role required."""
    user_role = getattr(request.state, "user_role", "doctor")
    if user_role != "admin":
        return JSONResponse(
            {"status": "denied", "error": "Only admins can process Stripe payroll"},
            status_code=403,
        )

    from tools.stripe_payroll import process_payroll_with_stripe, stripe_configured

    if not stripe_configured():
        return JSONResponse(
            {
                "status": "skipped",
                "error": "STRIPE_SECRET_KEY not configured on AI backend",
                "payroll_id": body.payroll_id,
            },
            status_code=503,
        )

    result = process_payroll_with_stripe(
        body.payroll_id,
        processed_by_staff_id=body.processed_by_staff_id,
    )
    status_code = 200
    if result.get("status") == "error":
        status_code = 400
    elif result.get("status") == "denied":
        status_code = 403
    return JSONResponse(result, status_code=status_code)


@router.get("/payroll/status")
async def payroll_status(request: Request):
    """Report whether Stripe payroll is configured (any authenticated role)."""
    from tools.stripe_payroll import stripe_configured

    return {
        "stripe_configured": stripe_configured(),
        "user_role": getattr(request.state, "user_role", None),
    }
