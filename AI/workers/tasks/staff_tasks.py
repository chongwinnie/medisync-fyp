"""Celery tasks for autonomous staff management operations.

Deterministic shift-gap scan writes notifications; LLM autonomous hop is optional.
"""
from __future__ import annotations

from workers.celery_app import celery_app


@celery_app.task(name="staff_tasks.weekly_shift_gap_scan", bind=True, max_retries=2)
def weekly_shift_gap_scan(self):
    """
    Weekly: scan next week's shifts for gaps or understaffing. Alert admin.
    Runs via Celery beat on Fridays at 16:00 UTC.
    """
    try:
        from db.notifications import scan_shift_gaps

        result = scan_shift_gaps()

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="staff_management",
                task=(
                    "Autonomous run: scan next week's shift schedule for staffing gaps, conflicts, "
                    "or understaffed shifts. Send alert email to admin with findings."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="staff_tasks.payroll_trigger", bind=True, max_retries=2)
def payroll_trigger(self):
    """
    Monthly: notify admin that payroll is ready for review (in-app).
    Runs via Celery beat on the 28th of each month at 17:00 UTC.
    """
    try:
        from db.notifications import notify_admins

        notified = notify_admins(
            ntype="staff",
            title="Monthly payroll review",
            body=(
                "Autonomous payroll trigger: open Staff → Payroll to review draft "
                "records and Process ready rows."
            ),
            entity_type="payroll_records",
        )
        result = {"status": "ok", "notifications_written": notified}

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="staff_management",
                task=(
                    "Autonomous run: trigger end-of-month payroll processing. Calculate net pay "
                    "for all active staff based on attendance records. Notify admin for review."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)
