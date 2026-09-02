"""Calendar tool — Google Calendar API (OAuth refresh or service account)."""
from __future__ import annotations

import json
import uuid

from langchain_core.tools import tool

from config.settings import settings
from tools.google_auth import (
    CALENDAR_SCOPES,
    build_google_service,
    google_oauth_configured,
    google_service_account_configured,
)


def _is_gcal_available() -> bool:
    return google_oauth_configured() or google_service_account_configured()


def _default_calendar_id() -> str:
    return (settings.google_calendar_id or "primary").strip() or "primary"


@tool
def check_appointment_conflicts(
    staff_id: str,
    start_iso: str,
    end_iso: str,
    calendar_id: str = "",
) -> str:
    """
    Check whether a staff member has conflicting appointments in the given time window.

    Args:
        staff_id: UUID of the staff member.
        start_iso: ISO 8601 start datetime (e.g., "2026-06-28T09:00:00+08:00").
        end_iso: ISO 8601 end datetime.
        calendar_id: Google Calendar ID (default: primary / GOOGLE_CALENDAR_ID).

    Returns:
        JSON string with conflict status and list of conflicting events.
    """
    cal_id = calendar_id or _default_calendar_id()
    if not _is_gcal_available():
        return json.dumps({
            "has_conflict": False,
            "conflicts": [],
            "note": "Google Calendar credentials not configured — stub response",
            "staff_id": staff_id,
            "window": {"start": start_iso, "end": end_iso},
        })

    try:
        service = build_google_service("calendar", "v3", CALENDAR_SCOPES)
        events_result = service.events().list(
            calendarId=cal_id,
            timeMin=start_iso,
            timeMax=end_iso,
            singleEvents=True,
            orderBy="startTime",
        ).execute()
        events = events_result.get("items", [])
        return json.dumps({
            "has_conflict": len(events) > 0,
            "conflicts": [
                {"id": e["id"], "summary": e.get("summary", ""), "start": e["start"]}
                for e in events
            ],
            "staff_id": staff_id,
        })
    except Exception as exc:
        return json.dumps({"error": str(exc), "has_conflict": False, "conflicts": []})


@tool
def create_calendar_event(
    staff_id: str,
    patient_name: str,
    start_iso: str,
    end_iso: str,
    summary: str,
    description: str = "",
    calendar_id: str = "",
) -> str:
    """
    Create a Google Calendar event for an appointment.

    Args:
        staff_id: UUID of the staff member.
        patient_name: Name of the patient (included in description).
        start_iso: ISO 8601 start datetime.
        end_iso: ISO 8601 end datetime.
        summary: Event title.
        description: Optional event notes.
        calendar_id: Google Calendar ID.

    Returns:
        JSON string with the created event ID and link, or stub confirmation.
    """
    cal_id = calendar_id or _default_calendar_id()
    if not _is_gcal_available():
        stub_id = str(uuid.uuid4())[:8]
        return json.dumps({
            "event_id": f"stub_{stub_id}",
            "html_link": f"https://calendar.google.com/stub/{stub_id}",
            "summary": summary,
            "status": "confirmed",
            "note": "Google Calendar credentials not configured — stub response",
        })

    try:
        service = build_google_service("calendar", "v3", CALENDAR_SCOPES)
        event_body = {
            "summary": summary,
            "description": f"Patient: {patient_name}\nStaff: {staff_id}\n{description}",
            # ISO strings with offset are accepted; timeZone helps Google normalize
            "start": {"dateTime": start_iso, "timeZone": "Asia/Kuala_Lumpur"},
            "end": {"dateTime": end_iso, "timeZone": "Asia/Kuala_Lumpur"},
        }
        event = service.events().insert(calendarId=cal_id, body=event_body).execute()
        return json.dumps({
            "event_id": event["id"],
            "html_link": event.get("htmlLink", ""),
            "summary": event.get("summary", ""),
            "status": event.get("status", "confirmed"),
            "provider": "google_calendar",
        })
    except Exception as exc:
        return json.dumps({"error": str(exc), "event_id": None})


@tool
def list_calendar_events(
    start_iso: str,
    end_iso: str,
    calendar_id: str = "",
    max_results: int = 20,
) -> str:
    """
    List Google Calendar events in a time window (Admin clinical-ops / AA).

    Args:
        start_iso: ISO 8601 window start.
        end_iso: ISO 8601 window end.
        calendar_id: Google Calendar ID (default primary).
        max_results: Max events to return (capped 50).
    """
    cal_id = calendar_id or _default_calendar_id()
    max_results = max(1, min(int(max_results), 50))
    if not _is_gcal_available():
        return json.dumps({
            "events": [],
            "note": "Google Calendar credentials not configured — stub empty list",
            "window": {"start": start_iso, "end": end_iso},
        })

    try:
        service = build_google_service("calendar", "v3", CALENDAR_SCOPES)
        events_result = service.events().list(
            calendarId=cal_id,
            timeMin=start_iso,
            timeMax=end_iso,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        ).execute()
        events = events_result.get("items", [])
        return json.dumps({
            "events": [
                {
                    "id": e.get("id"),
                    "summary": e.get("summary", ""),
                    "start": e.get("start"),
                    "end": e.get("end"),
                    "html_link": e.get("htmlLink", ""),
                    "status": e.get("status", ""),
                }
                for e in events
            ],
            "count": len(events),
        })
    except Exception as exc:
        return json.dumps({"error": str(exc), "events": []})


@tool
def delete_calendar_event(
    event_id: str,
    calendar_id: str = "",
) -> str:
    """
    Delete a Google Calendar event by ID (cleanup for LIVE probes / AA ops).

    Args:
        event_id: Google Calendar event ID.
        calendar_id: Google Calendar ID (default primary).
    """
    cal_id = calendar_id or _default_calendar_id()
    if not _is_gcal_available():
        return json.dumps({
            "status": "stub_deleted",
            "event_id": event_id,
            "note": "Google Calendar credentials not configured — stub delete",
        })
    try:
        service = build_google_service("calendar", "v3", CALENDAR_SCOPES)
        service.events().delete(calendarId=cal_id, eventId=event_id).execute()
        return json.dumps({
            "status": "deleted",
            "event_id": event_id,
            "provider": "google_calendar",
        })
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc), "event_id": event_id})
