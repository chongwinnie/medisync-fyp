"""Celery tasks for autonomous clinical operations (Patient Agent / DA).

Deterministic notifications for clinicians + optional LLM autonomous hop.
"""
from __future__ import annotations

from workers.celery_app import celery_app


@celery_app.task(name="clinical_tasks.nightly_diagnostic_review", bind=True, max_retries=2)
def nightly_diagnostic_review(self):
    """
    Nightly: notify clinicians about pending diagnostic reviews; optional Diagnose Agent agent run.
    """
    try:
        import asyncio

        from db.notifications import notify_roles
        from db.postgres import apg_connect

        async def _count_pending():
            conn = await apg_connect()
            try:
                return await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM diagnostic_reports
                    WHERE status = 'pending_review'
                      AND created_at >= now() - interval '7 days'
                    """
                )
            finally:
                await conn.close()

        count = int(asyncio.run(_count_pending()) or 0)
        notified = 0
        if count > 0:
            notified = notify_roles(
                roles=["doctor", "admin"],
                ntype="clinical",
                title=f"Diagnostics queue: {count} pending",
                body=(
                    f"Autonomous diagnostic review: {count} report(s) awaiting review. "
                    "Open Diagnostics → Pending Review."
                ),
                entity_type="diagnostic_reports",
            )

        result = {
            "status": "ok",
            "pending_count": count,
            "notifications_written": notified,
        }

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="medical_diagnostics",
                task=(
                    "Autonomous run: review all diagnostic reports marked 'pending_ai_review' "
                    "from the last 24 hours. Summarise key findings, flag any that need urgent "
                    "clinician attention, and write a concise batch summary. "
                    "All output is AI-assisted and requires clinician review."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="clinical_tasks.weekly_treatment_plan_review", bind=True, max_retries=2)
def weekly_treatment_plan_review(self):
    """
    Weekly: notify doctors about active treatment plans needing review; optional Patient Agent run.
    """
    try:
        import asyncio

        from db.notifications import notify_roles
        from db.postgres import apg_connect

        async def _count_active():
            conn = await apg_connect()
            try:
                return await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM treatment_plans
                    WHERE status IN ('draft', 'active')
                    """
                )
            finally:
                await conn.close()

        count = int(asyncio.run(_count_active()) or 0)
        notified = 0
        if count > 0:
            notified = notify_roles(
                roles=["doctor", "admin"],
                ntype="clinical",
                title=f"Treatment plans: {count} to review",
                body=(
                    f"Autonomous plan review: {count} draft/active treatment plan(s). "
                    "Open Patients to re-approve as needed."
                ),
                entity_type="treatment_plans",
            )

        result = {
            "status": "ok",
            "plan_count": count,
            "notifications_written": notified,
        }

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="patient_management",
                task=(
                    "Autonomous run: review all active treatment plans. Cross-check each plan "
                    "against the latest findings in patient_context, flag potential medication "
                    "interactions, and list plans that need clinician re-approval. "
                    "All output is an AI-assisted DRAFT and requires clinician review."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="clinical_tasks.auto_reindex_clinical_records", bind=True, max_retries=3)
def auto_reindex_clinical_records(self, patient_id: str | None = None):
    """
    Celery background worker: Re-index clinical records for a patient or full database into ChromaDB.
    Triggered when clinical notes, consultations, or diagnostic scans are finalized.
    """
    import asyncio
    try:
        from tools.auto_reindex import reindex_patient_clinical_records, reindex_all_clinical_records
        if patient_id:
            result = asyncio.run(reindex_patient_clinical_records(patient_id))
        else:
            result = asyncio.run(reindex_all_clinical_records())
        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=60)
