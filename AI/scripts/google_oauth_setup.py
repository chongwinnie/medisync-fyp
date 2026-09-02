#!/usr/bin/env python3
"""One-time Google OAuth consent helper for Gmail + Calendar refresh tokens.

Usage (from AI/):
  .venv/bin/python scripts/google_oauth_setup.py

Prerequisites:
  1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set in AI/.env
  2. In Google Cloud Console → APIs & Services → Credentials → your OAuth
     client → Authorized redirect URIs, add EXACTLY:
       http://localhost:8090/
  3. Enable Gmail API + Google Calendar API for the project
  4. OAuth consent screen: add your Google account as a test user if app is
     in Testing mode

The script prints ONLY the consent URL (no secrets), opens a local callback
server, then writes GOOGLE_REFRESH_TOKEN into AI/.env (never prints the token).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Must match Google Cloud Console authorized redirect URI exactly (trailing slash).
DEFAULT_REDIRECT_URI = "http://localhost:8090/"
DEFAULT_PORT = 8090

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",  # profile/labels smoke
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]


def _load_dotenv_values(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text().splitlines():
        if not line.strip() or line.strip().startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def _upsert_env(env_path: Path, key: str, value: str) -> None:
    """Set key=value in .env without printing the value."""
    text = env_path.read_text() if env_path.exists() else ""
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*$")
    replacement = f"{key}={value}"
    if pattern.search(text):
        text = pattern.sub(replacement, text, count=1)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += f"{replacement}\n"
    env_path.write_text(text)


def main() -> int:
    parser = argparse.ArgumentParser(description="MediSync Google OAuth setup")
    parser.add_argument(
        "--redirect-uri",
        default=None,
        help=f"Redirect URI (default: env GOOGLE_REDIRECT_URI or {DEFAULT_REDIRECT_URI})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help=f"Local callback port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not auto-open browser; print consent URL only",
    )
    parser.add_argument(
        "--from-refresh-file",
        default=None,
        help="Skip browser; read refresh token from a one-line file and write to .env",
    )
    args = parser.parse_args()

    env_path = ROOT / ".env"
    env = _load_dotenv_values(env_path)

    if args.from_refresh_file:
        token_path = Path(args.from_refresh_file)
        if not token_path.exists():
            print(f"ERROR: file not found: {token_path}", file=sys.stderr)
            return 1
        refresh = token_path.read_text().strip().splitlines()[0].strip()
        if not refresh:
            print("ERROR: refresh token file is empty", file=sys.stderr)
            return 1
        _upsert_env(env_path, "GOOGLE_REFRESH_TOKEN", refresh)
        print(
            f"Wrote GOOGLE_REFRESH_TOKEN to {env_path} "
            f"(len={len(refresh)}; value not printed)."
        )
        print("Restart uvicorn so Settings reloads the new token.")
        return 0

    client_id = (env.get("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (env.get("GOOGLE_CLIENT_SECRET") or "").strip()
    redirect_uri = (
        (args.redirect_uri or env.get("GOOGLE_REDIRECT_URI") or DEFAULT_REDIRECT_URI).strip()
    )
    if not redirect_uri.endswith("/"):
        # Google often requires trailing slash for localhost InstalledAppFlow
        redirect_uri = redirect_uri + "/"

    if not client_id or not client_secret:
        print(
            "ERROR: Set non-empty GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in AI/.env first.",
            file=sys.stderr,
        )
        return 1

    # Derive port from redirect URI if not set
    port = args.port
    if port is None:
        from urllib.parse import urlparse

        parsed = urlparse(redirect_uri)
        port = parsed.port or DEFAULT_PORT

    print("=== MediSync Google OAuth setup ===")
    print(f"Redirect URI (add in Google Console): {redirect_uri}")
    print(f"Local callback port: {port}")
    print(f"Scopes: {len(SCOPES)} (gmail.send, gmail.readonly, calendar, calendar.events)")
    print()

    from google_auth_oauthlib.flow import InstalledAppFlow

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri, "http://localhost", "urn:ietf:wg:oauth:2.0:oob"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

    # Build URL for the user (safe to print)
    # run_local_server will also print/open; we force authorization prompt for refresh token
    try:
        creds = flow.run_local_server(
            port=port,
            open_browser=not args.no_browser,
            authorization_prompt_message=(
                "Open this URL in a browser if it did not open automatically:\n{url}\n"
            ),
            success_message="MediSync Google OAuth OK — you can close this tab.",
            access_type="offline",
            prompt="consent",
        )
    except OSError as exc:
        print(f"ERROR: Could not bind localhost:{port} — {exc}", file=sys.stderr)
        print("Free the port or pass --port / update GOOGLE_REDIRECT_URI.", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR: OAuth flow failed: {exc}", file=sys.stderr)
        print(
            "\nFIX redirect_uri_mismatch in Google Cloud Console:\n"
            "  1. Open https://console.cloud.google.com/apis/credentials\n"
            "  2. Select the project that owns this OAuth client\n"
            "  3. Edit the OAuth 2.0 Client ID used in GOOGLE_CLIENT_ID\n"
            "  4. Under Authorized redirect URIs, ADD exactly:\n"
            f"       {redirect_uri}\n"
            "     (also add http://127.0.0.1:8090/ if you use 127.0.0.1)\n"
            "  5. Save, wait ~1 minute, re-run this script\n"
            "\nRecommended alternative: create an OAuth client type "
            "'Desktop app' (loopback localhost is allowed), put its "
            "client id/secret in AI/.env, then re-run this script.\n"
            "Enable APIs: Gmail API + Google Calendar API. "
            "Consent screen Testing → add your Google account as test user.\n",
            file=sys.stderr,
        )
        return 1

    refresh = (creds.refresh_token or "").strip()
    if not refresh:
        print(
            "ERROR: No refresh_token returned. Revoke prior grants at "
            "https://myaccount.google.com/permissions then re-run with prompt=consent.",
            file=sys.stderr,
        )
        return 1

    _upsert_env(env_path, "GOOGLE_REFRESH_TOKEN", refresh)
    _upsert_env(env_path, "GOOGLE_REDIRECT_URI", redirect_uri)
    print(f"Wrote GOOGLE_REFRESH_TOKEN to {env_path} (len={len(refresh)}; value not printed).")
    print("Restart uvicorn so Settings reloads the new token.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
