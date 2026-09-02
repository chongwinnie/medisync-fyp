"""Celery tasks for autonomous appointment scheduling operations.

Deterministic conflict scan writes notifications; LLM autonomous hop is optional.
"""
from __future__ import annotations

from workers.celery_app import celery_app


@celery_app.task(name="appointment_tasks.nightly_conflict_scan", bind=True, max_retries=2)
def nightly_conflict_scan(self):
    """
    Nightly: scan upcoming appointments for conflicts, notify admins in-app.
    Runs via Celery beat at 23:00 UTC daily.
    """
    try:
        from db.notifications import scan_appointment_conflicts

        result = scan_appointment_conflicts()

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="appointment_scheduling",
                task=(
                    "Autonomous run: perform nightly conflict scan and send reminders for "
                    "tomorrow's appointments."
                ),
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="appointment_tasks.send_reminders", bind=True, max_retries=2)
def send_appointment_reminders(self):
    """
    Daily: notify staff about tomorrow's appointments (in-app) + optional email agent.
    Runs via Celery beat at 08:00 UTC daily.
    """
    try:
        import asyncio

        from db.notifications import notify_roles
        from db.postgres import apg_connect

        async def _count_tomorrow():
            conn = await apg_connect()
            try:
                return await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM appointments
                    WHERE start_time::date = (CURRENT_DATE + 1)
                      AND status NOT IN ('cancelled', 'no_show', 'completed')
                    """
                )
            finally:
                await conn.close()

        count = int(asyncio.run(_count_tomorrow()) or 0)
        notified = 0
        if count > 0:
            notified = notify_roles(
                roles=["admin", "doctor", "nurse"],
                ntype="appointment",
                title=f"Tomorrow: {count} appointment(s)",
                body=(
                    f"Daily reminder: {count} appointment(s) scheduled for tomorrow. "
                    "Open Appointments / My Schedule to prepare."
                ),
                entity_type="appointments",
            )

        result = {
            "status": "ok",
            "tomorrow_count": count,
            "notifications_written": notified,
        }

        try:
            from graph.graph import run_autonomous

            agent = run_autonomous(
                target_agent="appointment_scheduling",
                task="Autonomous run: send email reminders for all appointments scheduled for tomorrow.",
            )
            result["agent"] = agent
        except Exception as agent_exc:
            result["agent_error"] = str(agent_exc)

        return result
    except Exception as exc:
        self.retry(exc=exc, countdown=300)


@celery_app.task(name="appointment_tasks.send_appointment_confirmation", bind=True, max_retries=2)
def send_appointment_confirmation(self, appointment_id: str):
    """
    Send a patient confirmation email for one appointment via the Appointment Agent agent.

    Triggered by POST /appointments/notify. Loads the appointment + patient email
    from Postgres so the agent receives exact inputs (no discovery needed), then
    runs the Appointment Scheduling agent autonomously to send the email and log it.
    """
    try:
        import asyncio

        from db.postgres import apg_connect

        async def _load():
            conn = await apg_connect()
            try:
                return await conn.fetchrow(
                    """SELECT a.id, a.start_time, a.end_time, a.visit_type, a.status,
                              p.full_name AS patient_name, p.email AS patient_email,
                              s.full_name AS staff_name
                       FROM appointments a
                       JOIN patients p ON p.id = a.patient_id
                       LEFT JOIN staff s ON s.id = a.staff_id
                       WHERE a.id = $1::uuid""",
                    appointment_id,
                )
            finally:
                await conn.close()

        row = asyncio.run(_load())
        if row is None:
            return {"status": "error", "error": f"appointment {appointment_id} not found"}
        if not row["patient_email"]:
            return {
                "status": "skipped",
                "reason": "patient has no email on file",
                "appointment_id": appointment_id,
            }

        start_iso = row["start_time"].isoformat()
        end_iso = row["end_time"].isoformat()
        patient_email = row["patient_email"]
        task = (
            "Send an appointment confirmation email to the patient, then stop.\n\n"
            f"Appointment id: {appointment_id}\n"
            f"Patient: {row['patient_name']} <{patient_email}>\n"
            f"Doctor: {row['staff_name']}\n"
            f"Visit type: {row['visit_type']}\n"
            f"Start: {start_iso}\n"
            f"End: {end_iso}\n"
            f"Status: {row['status']}\n\n"
            "Steps (call each tool once, then stop):\n"
            f"1. send_email(to='{patient_email}', "
            "subject='Your MediSync appointment is confirmed', body=a short friendly "
            "HTML confirmation that includes the patient name, doctor name, visit type, "
            "and the start and end time).\n"
            "2. write_audit_log(action='appointment_confirmation_email', "
            f"entity_type='appointments', entity_id='{appointment_id}', "
            "details with the recipient and appointment id).\n"
            "3. Reply with one line confirming the email was sent, then stop."
        )

        from graph.graph import run_autonomous

        return run_autonomous(
            target_agent="appointment_scheduling",
            task=task,
            user_id="system",
            user_role="admin",
        )

    except Exception as exc:
        self.retry(exc=exc, countdown=60)
