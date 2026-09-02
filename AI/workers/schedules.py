"""Celery beat schedule — defines all cron jobs for autonomous agent tasks."""
from __future__ import annotations

from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    # Appointment tasks
    "nightly-conflict-scan": {
        "task": "appointment_tasks.nightly_conflict_scan",
        "schedule": crontab(hour=23, minute=0),  # 23:00 UTC daily
    },
    "daily-appointment-reminders": {
        "task": "appointment_tasks.send_reminders",
        "schedule": crontab(hour=8, minute=0),  # 08:00 UTC daily
    },
    # Inventory tasks
    "daily-stock-check": {
        "task": "inventory_tasks.daily_stock_check",
        "schedule": crontab(hour=7, minute=0),  # 07:00 UTC daily
    },
    "weekly-reorder-check": {
        "task": "inventory_tasks.reorder_check",
        "schedule": crontab(hour=9, minute=0, day_of_week="monday"),  # Mondays 09:00 UTC
    },
    # Staff tasks
    "weekly-shift-gap-scan": {
        "task": "staff_tasks.weekly_shift_gap_scan",
        "schedule": crontab(hour=16, minute=0, day_of_week="friday"),  # Fridays 16:00 UTC
    },
    "monthly-payroll-trigger": {
        "task": "staff_tasks.payroll_trigger",
        "schedule": crontab(hour=17, minute=0, day_of_month="28"),  # 28th of month 17:00 UTC
    },
    # Clinical tasks (Patient Agent / Diagnose Agent autonomous — Amendment 1.1)
    "nightly-diagnostic-review": {
        "task": "clinical_tasks.nightly_diagnostic_review",
        "schedule": crontab(hour=2, minute=0),  # 02:00 UTC daily
    },
    "weekly-treatment-plan-review": {
        "task": "clinical_tasks.weekly_treatment_plan_review",
        "schedule": crontab(hour=6, minute=0, day_of_week="monday"),  # Mondays 06:00 UTC
    },
}

# Apply to Celery app
from workers.celery_app import celery_app  # noqa: E402
celery_app.conf.beat_schedule = CELERYBEAT_SCHEDULE
