"""Shared Google OAuth credentials for Gmail + Calendar tools.

OAuth setup: `python scripts/google_oauth_setup.py`
Authorized redirect URI (Google Cloud Console): http://localhost:8090/
"""
from __future__ import annotations

import json
import os
from typing import Any

from config.settings import settings

# Must match AI/scripts/google_oauth_setup.py DEFAULT_REDIRECT_URI
GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:8090/"

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]
CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]


def google_oauth_configured() -> bool:
    return bool(
        (settings.google_client_id or "").strip()
        and (settings.google_client_secret or "").strip()
        and (settings.google_refresh_token or "").strip()
    )


def google_service_account_configured() -> bool:
    raw = (settings.google_calendar_credentials or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS") or "").strip()
    return bool(raw)


def get_oauth_credentials(scopes: list[str]):
    """Build google.oauth2.credentials.Credentials from refresh token env vars."""
    from google.oauth2.credentials import Credentials

    if not google_oauth_configured():
        raise RuntimeError(
            "Google OAuth not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
        )
    return Credentials(
        token=None,
        refresh_token=settings.google_refresh_token.strip(),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id.strip(),
        client_secret=settings.google_client_secret.strip(),
        scopes=scopes,
    )


def get_service_account_credentials(scopes: list[str]):
    from google.oauth2.service_account import Credentials

    raw = (settings.google_calendar_credentials or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS") or "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_CALENDAR_CREDENTIALS not configured")
    info: dict[str, Any] = json.loads(raw)
    return Credentials.from_service_account_info(info, scopes=scopes)


def build_google_service(api: str, version: str, scopes: list[str]):
    """Return an authorized googleapiclient discovery service."""
    from googleapiclient.discovery import build

    if google_oauth_configured():
        creds = get_oauth_credentials(scopes)
        return build(api, version, credentials=creds, cache_discovery=False)
    if api == "calendar" and google_service_account_configured():
        creds = get_service_account_credentials(scopes)
        return build(api, version, credentials=creds, cache_discovery=False)
    raise RuntimeError(
        f"No Google credentials for {api}. Configure OAuth refresh token "
        "(GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN) or GOOGLE_CALENDAR_CREDENTIALS."
    )
