"""Stripe-backed payroll tools — Admin only.

Demo pattern (documented for FYP):
- Default: create + confirm a Stripe PaymentIntent for net_pay (test mode uses
  pm_card_visa). Records stripe_payment_intent_id and marks payroll as paid.
- Optional: if staff.stripe_connect_account_id is set, create a Transfer to that
  Connect account instead (platform balance must be funded in live/test).

Role gate: every write tool requires user_role=admin and refuses doctor/nurse.
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from langchain_core.tools import tool

from config.settings import settings
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
        return pool.submit(asyncio.run, coro).result(timeout=45)


def _deny_non_admin(user_role: str) -> str | None:
    role = (user_role or "").strip().lower()
    if role != "admin":
        return json.dumps({
            "status": "denied",
            "error": "Only admin may execute Stripe payroll writes",
            "user_role": role or "unknown",
        })
    return None


def stripe_configured() -> bool:
    return bool((settings.stripe_secret_key or "").strip())


def _stripe_client():
    import stripe

    key = (settings.stripe_secret_key or "").strip()
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY not configured")
    stripe.api_key = key
    return stripe


def process_payroll_with_stripe(
    payroll_id: str,
    *,
    processed_by_staff_id: str | None = None,
) -> dict:
    """
    Core Stripe payroll processor (shared by API route + LangChain tool).

    Returns a result dict with status, stripe ids, and DB fields.
    """
    if not stripe_configured():
        return {
            "status": "skipped",
            "reason": "STRIPE_SECRET_KEY not configured",
            "payroll_id": payroll_id,
        }

    async def _q() -> dict:
        conn = await apg_connect()
        try:
            row = await conn.fetchrow(
                """
                SELECT pr.id, pr.staff_id, pr.pay_month, pr.pay_year, pr.net_pay,
                       pr.status, pr.stripe_payment_intent_id, pr.stripe_transfer_id,
                       s.full_name, s.stripe_connect_account_id, u.email AS staff_email
                FROM payroll_records pr
                JOIN staff s ON s.id = pr.staff_id
                JOIN users u ON u.id = s.user_id
                WHERE pr.id = $1::uuid
                """,
                payroll_id,
            )
            if not row:
                return {"status": "error", "error": "Payroll record not found", "payroll_id": payroll_id}

            if row["status"] == "paid":
                return {
                    "status": "already_paid",
                    "payroll_id": payroll_id,
                    "stripe_payment_intent_id": row["stripe_payment_intent_id"],
                    "stripe_transfer_id": row["stripe_transfer_id"],
                }

            if row["status"] not in ("draft", "processed"):
                return {
                    "status": "error",
                    "error": f"Cannot pay payroll in status={row['status']}",
                    "payroll_id": payroll_id,
                }

            net = Decimal(str(row["net_pay"] or 0))
            if net <= 0:
                return {"status": "error", "error": "net_pay must be > 0", "payroll_id": payroll_id}

            currency = (settings.stripe_currency or "myr").lower()
            amount_cents = int((net * 100).quantize(Decimal("1")))
            # Stripe MYR (and several others) reject sub-minimum charges (e.g. MYR < RM 2.00)
            min_cents = 200 if currency == "myr" else 50
            if amount_cents < min_cents:
                return {
                    "status": "error",
                    "error": (
                        f"net_pay too small for Stripe {currency.upper()} "
                        f"(min {min_cents / 100:.2f})"
                    ),
                    "payroll_id": payroll_id,
                    "amount_cents": amount_cents,
                }

            stripe = _stripe_client()
            metadata = {
                "payroll_id": str(row["id"]),
                "staff_id": str(row["staff_id"]),
                "staff_name": row["full_name"] or "",
                "pay_period": f"{row['pay_year']}-{int(row['pay_month']):02d}",
            }

            payment_intent_id = None
            transfer_id = None
            connect_account = (row["stripe_connect_account_id"] or "").strip()

            if connect_account:
                # Connect transfer path (optional)
                transfer = stripe.Transfer.create(
                    amount=amount_cents,
                    currency=currency,
                    destination=connect_account,
                    metadata=metadata,
                    description=f"MediSync payroll {metadata['pay_period']} — {row['full_name']}",
                )
                transfer_id = transfer.id
            else:
                # PaymentIntent demo path — confirm with Stripe test payment method
                create_kwargs = {
                    "amount": amount_cents,
                    "currency": currency,
                    "payment_method": "pm_card_visa",
                    "confirm": True,
                    "payment_method_types": ["card"],
                    "metadata": metadata,
                    "description": (
                        f"MediSync payroll {metadata['pay_period']} — {row['full_name']}"
                    ),
                }
                if row["staff_email"]:
                    create_kwargs["receipt_email"] = row["staff_email"]
                intent = stripe.PaymentIntent.create(**create_kwargs)
                payment_intent_id = intent.id
                if intent.status not in ("succeeded", "processing"):
                    return {
                        "status": "error",
                        "error": f"PaymentIntent status={intent.status}",
                        "payroll_id": payroll_id,
                        "stripe_payment_intent_id": payment_intent_id,
                    }

            now = datetime.now(timezone.utc)
            await conn.execute(
                """
                UPDATE payroll_records
                SET status = 'paid',
                    processed_by = COALESCE($2::uuid, processed_by),
                    processed_at = COALESCE(processed_at, $3::timestamptz),
                    paid_at = $3::timestamptz,
                    stripe_payment_intent_id = COALESCE($4, stripe_payment_intent_id),
                    stripe_transfer_id = COALESCE($5, stripe_transfer_id),
                    updated_at = $3::timestamptz
                WHERE id = $1::uuid
                """,
                payroll_id,
                processed_by_staff_id,
                now,
                payment_intent_id,
                transfer_id,
            )
            return {
                "status": "paid",
                "payroll_id": payroll_id,
                "staff_name": row["full_name"],
                "amount": float(net),
                "currency": currency,
                "stripe_payment_intent_id": payment_intent_id,
                "stripe_transfer_id": transfer_id,
                "path": "transfer" if transfer_id else "payment_intent",
            }
        finally:
            await conn.close()

    try:
        return _run(_q())
    except Exception as exc:
        print(f"[stripe_payroll] process failed: {exc}", file=sys.stderr)
        return {"status": "error", "error": str(exc), "payroll_id": payroll_id}


@tool
def list_payroll_records(
    status: str | None = None,
    pay_month: int | None = None,
    pay_year: int | None = None,
    limit: int = 50,
) -> str:
    """
    List payroll records from Postgres (Admin). Optional filters by status / period.

    Args:
        status: draft | processed | paid | cancelled
        pay_month: 1-12
        pay_year: e.g. 2026
        limit: max rows (capped 200)
    """
    limit = max(1, min(int(limit), 200))

    async def _q() -> str:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT pr.id, pr.staff_id, s.full_name AS staff_name, pr.pay_month, pr.pay_year,
                       pr.days_worked, pr.base_salary, pr.overtime_pay, pr.deductions, pr.net_pay,
                       pr.status, pr.stripe_payment_intent_id, pr.stripe_transfer_id, pr.paid_at
                FROM payroll_records pr
                JOIN staff s ON s.id = pr.staff_id
                WHERE ($1::text IS NULL OR pr.status::text = $1)
                  AND ($2::int IS NULL OR pr.pay_month = $2)
                  AND ($3::int IS NULL OR pr.pay_year = $3)
                ORDER BY pr.pay_year DESC, pr.pay_month DESC, s.full_name
                LIMIT $4
                """,
                status,
                pay_month,
                pay_year,
                limit,
            )
            return json.dumps([dict(r) for r in rows], default=_json_default)
        finally:
            await conn.close()

    try:
        return _run(_q())
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@tool
def process_stripe_payroll(
    payroll_id: str,
    user_role: str = "admin",
    processed_by_staff_id: str | None = None,
) -> str:
    """
    Process a payroll record via Stripe (Admin only). Creates a PaymentIntent
    (or Connect Transfer if staff has stripe_connect_account_id) and marks the
    record paid.

    Args:
        payroll_id: UUID of payroll_records row
        user_role: Must be 'admin' — doctor/nurse are denied
        processed_by_staff_id: Optional staff UUID of the admin processor
    """
    denied = _deny_non_admin(user_role)
    if denied:
        return denied
    result = process_payroll_with_stripe(
        payroll_id, processed_by_staff_id=processed_by_staff_id
    )
    return json.dumps(result, default=_json_default)


@tool
def process_all_draft_payroll(
    user_role: str = "admin",
    pay_month: int | None = None,
    pay_year: int | None = None,
    limit: int = 20,
) -> str:
    """
    Process up to `limit` draft/processed payroll rows via Stripe (Admin only).

    Args:
        user_role: Must be 'admin'
        pay_month / pay_year: optional period filter
        limit: max rows to pay in one call (capped 50)
    """
    denied = _deny_non_admin(user_role)
    if denied:
        return denied
    if not stripe_configured():
        return json.dumps({
            "status": "skipped",
            "reason": "STRIPE_SECRET_KEY not configured",
        })

    limit = max(1, min(int(limit), 50))

    async def _ids() -> list[str]:
        conn = await apg_connect()
        try:
            rows = await conn.fetch(
                """
                SELECT id FROM payroll_records
                WHERE status IN ('draft', 'processed')
                  AND ($1::int IS NULL OR pay_month = $1)
                  AND ($2::int IS NULL OR pay_year = $2)
                ORDER BY pay_year, pay_month, created_at
                LIMIT $3
                """,
                pay_month,
                pay_year,
                limit,
            )
            return [str(r["id"]) for r in rows]
        finally:
            await conn.close()

    try:
        ids = _run(_ids())
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc)})

    results = [process_payroll_with_stripe(pid) for pid in ids]
    paid = sum(1 for r in results if r.get("status") == "paid")
    return json.dumps({
        "status": "ok",
        "attempted": len(ids),
        "paid": paid,
        "results": results,
    }, default=_json_default)
