"""Celery tasks for autonomous inventory and resource management operations.

Deterministic DB path writes inventory_alerts + notifications (demo-proven).
Optional LLM autonomous hop remains non-fatal for email/agent narrative.
"""
from __future__ import annotations

from workers.celery_app import celery_app


@celery_app.task(name="inventory_tasks.daily_stock_check", bind=True, max_retries=2)
def daily_stock_check(self):
    """
    Daily: scan for low-stock items, sync alerts, notify admins in-app.
    Runs via Celery beat at 07:00 UTC daily.
    """
    try:
        from db.notifications import sync_low_stock_alerts

        result = sync_low_stock_alerts()

        # Optional agent narrative / email path — never blocks notification write.
        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="inventory_resource",
                task=(
                    "Autonomous run: check all inventory items — flag low-stock (at or below "
                    "minimum level) and items expiring within 30 days. Send alert emails to admin."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="inventory_tasks.reorder_check", bind=True, max_retries=2)
def reorder_check(self):
    """
    Weekly: identify items that need reordering and notify procurement admin.
    Runs via Celery beat on Mondays at 09:00 UTC.
    """
    try:
        from db.notifications import notify_admins, sync_low_stock_alerts

        stock = sync_low_stock_alerts()
        count = int(stock.get("low_stock_count") or 0)
        if count > 0:
            notify_admins(
                ntype="inventory",
                title=f"Reorder review: {count} item(s) below minimum",
                body=(
                    "Weekly reorder check: review Inventory → Alerts and place "
                    "purchase orders for low-stock SKUs."
                ),
                entity_type="inventory_items",
            )

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="inventory_resource",
                task=(
                    "Autonomous run: identify all inventory items below reorder threshold. "
                    "Send reorder notification emails to admin with quantities needed."
                ),
            )
            stock["agent"] = agent
        except Exception as agent_exc:
            stock["agent_error"] = str(agent_exc)

        return stock
    except Exception as exc:
        self.retry(exc=exc, countdown=300)
