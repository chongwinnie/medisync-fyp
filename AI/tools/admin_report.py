"""Admin hospital management report tool — aggregates across all domains."""
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
        return pool.submit(asyncio.run, coro).result(timeout=45)


@tool
def generate_hospital_report(period: str = "month") -> str:
    """
    Generate a comprehensive hospital management report aggregating data across
    patients, appointments, inventory, staff, and billing.

    Args:
        period: One of 'today', 'week', 'month', 'year'. Default 'month'.

    Returns:
        JSON with sections: patients, appointments, inventory, staff, billing.
    """
    PERIOD_SQL = {
        "today": "date_trunc('day', now())",
        "week": "date_trunc('week', now())",
        "month": "date_trunc('month', now())",
        "year": "date_trunc('year', now())",
    }
    since = PERIOD_SQL.get(period, PERIOD_SQL["month"])

    async def _q() -> str:
        conn = await apg_connect()
        try:
            # ── Patients ──────────────────────────────────────────────
            patient_row = await conn.fetchrow(
                f"""
                SELECT
                  COUNT(*) AS total_patients,
                  COUNT(*) FILTER (WHERE status = 'admitted') AS admitted,
                  COUNT(*) FILTER (WHERE status = 'outpatient') AS outpatient,
                  COUNT(*) FILTER (WHERE status = 'discharged') AS discharged,
                  COUNT(*) FILTER (WHERE created_at >= {since}) AS new_this_period
                FROM patients
                """
            )

            # ── Appointments ──────────────────────────────────────────
            appt_row = await conn.fetchrow(
                f"""
                SELECT
                  COUNT(*) FILTER (WHERE created_at >= {since}) AS total_this_period,
                  COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= {since}) AS completed,
                  COUNT(*) FILTER (WHERE status = 'cancelled' AND created_at >= {since}) AS cancelled,
                  COUNT(*) FILTER (WHERE status = 'no_show' AND created_at >= {since}) AS no_shows,
                  COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed') AND start_time::date = CURRENT_DATE) AS today_scheduled
                FROM appointments
                """
            )

            # ── Inventory ─────────────────────────────────────────────
            inv_row = await conn.fetchrow(
                """
                SELECT
                  COUNT(*) AS total_items,
                  COUNT(*) FILTER (WHERE current_stock <= minimum_level) AS low_stock_items,
                  COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + 30) AS expiring_soon,
                  COUNT(*) FILTER (WHERE status = 'expired') AS expired_items
                FROM inventory_items WHERE status = 'active'
                """
            )

            # ── Staff ─────────────────────────────────────────────────
            staff_row = await conn.fetchrow(
                f"""
                SELECT
                  COUNT(*) AS total_staff,
                  COUNT(*) FILTER (WHERE u.role = 'doctor') AS doctors,
                  COUNT(*) FILTER (WHERE u.role = 'nurse') AS nurses,
                  COUNT(*) FILTER (WHERE u.role = 'admin') AS admins,
                  (SELECT COUNT(*) FROM shift_schedules
                    WHERE shift_date = CURRENT_DATE AND is_published = true) AS on_shift_today,
                  (SELECT COUNT(*) FROM shift_schedules
                    WHERE conflict_flagged = true AND shift_date >= CURRENT_DATE) AS shift_conflicts
                FROM staff s JOIN users u ON u.id = s.user_id
                """
            )

            # Payroll (if table exists)
            try:
                payroll_row = await conn.fetchrow(
                    f"""
                    SELECT
                      COUNT(*) FILTER (WHERE status = 'draft') AS payroll_draft,
                      COUNT(*) FILTER (WHERE status = 'paid' AND processed_at >= {since}) AS payroll_paid_this_period,
                      COALESCE(SUM(net_pay) FILTER (WHERE status = 'paid' AND processed_at >= {since}), 0) AS payroll_total_paid
                    FROM payroll_records
                    """
                )
            except Exception:
                payroll_row = None

            # ── Billing ───────────────────────────────────────────────
            try:
                billing_row = await conn.fetchrow(
                    f"""
                    SELECT
                      COUNT(*) FILTER (WHERE created_at >= {since}) AS invoices_this_period,
                      COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND paid_at >= {since}), 0) AS revenue_collected,
                      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('sent','overdue')), 0) AS outstanding,
                      COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count
                    FROM invoices
                    """
                )
            except Exception:
                billing_row = None

        finally:
            await conn.close()

        report = {
            "period": period,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "patients": dict(patient_row) if patient_row else {},
            "appointments": dict(appt_row) if appt_row else {},
            "inventory": dict(inv_row) if inv_row else {},
            "staff": dict(staff_row) if staff_row else {},
            "payroll": dict(payroll_row) if payroll_row else {},
            "billing": dict(billing_row) if billing_row else {},
        }
        return json.dumps(report, default=_json_default)

    return _run(_q())
