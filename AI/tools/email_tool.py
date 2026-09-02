"""Email tool — Gmail API primary when OAuth configured, else Resend."""
from __future__ import annotations

import base64
import json
import re
import sys
from email.mime.text import MIMEText

from langchain_core.tools import tool

from config.settings import settings


def _send_via_gmail(to: str, subject: str, body: str, from_address: str | None) -> dict:
    from tools.google_auth import GMAIL_SCOPES, build_google_service, google_oauth_configured

    if not google_oauth_configured():
        raise RuntimeError("Gmail OAuth not configured")

    service = build_google_service("gmail", "v1", GMAIL_SCOPES)
    mime = MIMEText(body, "html" if body.strip().startswith("<") else "plain", "utf-8")
    mime["to"] = to
    mime["subject"] = subject
    if from_address:
        mime["from"] = from_address

    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode("utf-8")
    sent = (
        service.users()
        .messages()
        .send(userId="me", body={"raw": raw})
        .execute()
    )
    return {
        "status": "sent",
        "provider": "gmail",
        "id": sent.get("id", ""),
        "to": to,
        "subject": subject,
    }


def _send_via_resend(
    to: str,
    subject: str,
    body: str,
    template: str | None,
    from_address: str | None,
) -> dict:
    api_key = settings.resend_api_key
    sender = from_address or settings.resend_from

    if not api_key:
        return {
            "status": "skipped",
            "reason": "No Gmail OAuth and RESEND_API_KEY not configured",
            "to": to,
            "subject": subject,
        }

    import resend

    resend.api_key = api_key
    payload: dict = {
        "from": sender,
        "to": [to],
        "subject": subject,
    }
    if template:
        payload["template_id"] = template
    else:
        if body.strip().startswith("<"):
            payload["html"] = body
        else:
            payload["text"] = body

    response = resend.Emails.send(payload)
    return {
        "status": "sent",
        "provider": "resend",
        "id": getattr(response, "id", ""),
        "to": to,
        "subject": subject,
    }


@tool
def send_email(
    to: str,
    subject: str,
    body: str,
    template: str | None = None,
    from_address: str | None = None,
) -> str:
    """
    Send an email via Gmail API (preferred when Google OAuth is configured)
    or Resend API as fallback.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body (plain text or HTML).
        template: Optional Resend template ID (Resend path only).
        from_address: Optional sender address.

    Returns:
        JSON string with send status and message ID (or skip reason).
    """
    from tools.google_auth import google_oauth_configured

    try:
        if google_oauth_configured():
            result = _send_via_gmail(to, subject, body, from_address)
            return json.dumps(result)
        result = _send_via_resend(to, subject, body, template, from_address)
        if result.get("status") == "skipped":
            print(
                f"[email_tool] skipped — would send: to={to} subject={subject!r}",
                file=sys.stderr,
            )
        return json.dumps(result)
    except Exception as exc:
        print(f"[email_tool] Send failed: {exc}", file=sys.stderr)
        # Fall back to Resend if Gmail failed
        try:
            if google_oauth_configured() and settings.resend_api_key:
                result = _send_via_resend(to, subject, body, template, from_address)
                result["gmail_error"] = str(exc)
                return json.dumps(result)
        except Exception as resend_exc:
            return json.dumps({
                "status": "error",
                "error": str(exc),
                "resend_error": str(resend_exc),
                "to": to,
            })
        return json.dumps({"status": "error", "error": str(exc), "to": to})


@tool
def send_gmail(
    to: str,
    subject: str,
    body: str,
) -> str:
    """
    Send email strictly via Gmail API (requires Google OAuth refresh token).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain text or HTML body.
    """
    try:
        return json.dumps(_send_via_gmail(to, subject, body, None))
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc), "provider": "gmail", "to": to})


def _header_map(payload: dict) -> dict[str, str]:
    headers = payload.get("headers") or []
    out: dict[str, str] = {}
    for h in headers:
        name = (h.get("name") or "").strip().lower()
        if name:
            out[name] = h.get("value") or ""
    return out


def _decode_body_data(data: str | None) -> str:
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_plain_text(payload: dict) -> str:
    """Best-effort plain text from a Gmail message payload (may be multipart)."""
    mime = (payload.get("mimeType") or "").lower()
    body = payload.get("body") or {}
    data = body.get("data")
    if data and mime.startswith("text/plain"):
        return _decode_body_data(data)
    if data and mime.startswith("text/html") and not payload.get("parts"):
        # Strip tags lightly for agent readability
        html = _decode_body_data(data)
        return re.sub(r"<[^>]+>", " ", html)

    parts = payload.get("parts") or []
    plain_chunks: list[str] = []
    html_chunks: list[str] = []
    for part in parts:
        part_mime = (part.get("mimeType") or "").lower()
        if part_mime.startswith("multipart/"):
            nested = _extract_plain_text(part)
            if nested:
                plain_chunks.append(nested)
            continue
        part_data = (part.get("body") or {}).get("data")
        if not part_data:
            continue
        text = _decode_body_data(part_data)
        if part_mime == "text/plain":
            plain_chunks.append(text)
        elif part_mime == "text/html":
            html_chunks.append(re.sub(r"<[^>]+>", " ", text))
    if plain_chunks:
        return "\n".join(plain_chunks).strip()
    if html_chunks:
        return "\n".join(html_chunks).strip()
    if data:
        return _decode_body_data(data)
    return ""


@tool
def list_inbox_messages(
    query: str = (
        "MediSync OR subject:appointment OR "
        "(appointment AND (booking OR reschedule OR cancel OR confirmation OR reminder))"
    ),
    max_results: int = 10,
) -> str:
    """
    List recent Gmail inbox messages (customer replies / inbound mail).
    Requires Google OAuth with gmail.readonly.

    Args:
        query: Gmail search query (default targets MediSync / appointment-related mail).
        max_results: Max messages to return (1–25).

    Returns:
        JSON with messages: id, thread_id, from, subject, date, snippet.
    """
    from tools.google_auth import GMAIL_SCOPES, build_google_service, google_oauth_configured

    if not google_oauth_configured():
        return json.dumps({
            "status": "skipped",
            "reason": "Gmail OAuth not configured",
            "messages": [],
        })

    limit = max(1, min(int(max_results or 10), 25))
    q = (query or "").strip() or "in:inbox"
    try:
        service = build_google_service("gmail", "v1", GMAIL_SCOPES)
        listed = (
            service.users()
            .messages()
            .list(userId="me", q=q, maxResults=limit)
            .execute()
        )
        refs = listed.get("messages") or []
        messages: list[dict] = []
        for ref in refs:
            mid = ref.get("id")
            if not mid:
                continue
            meta = (
                service.users()
                .messages()
                .get(
                    userId="me",
                    id=mid,
                    format="metadata",
                    metadataHeaders=["From", "Subject", "Date"],
                )
                .execute()
            )
            headers = _header_map(meta.get("payload") or {})
            messages.append({
                "id": mid,
                "thread_id": meta.get("threadId") or ref.get("threadId") or "",
                "from": headers.get("from", ""),
                "subject": headers.get("subject", ""),
                "date": headers.get("date", ""),
                "snippet": meta.get("snippet") or "",
            })
        return json.dumps({
            "status": "ok",
            "provider": "gmail",
            "query": q,
            "count": len(messages),
            "messages": messages,
        })
    except Exception as exc:
        print(f"[email_tool] list_inbox_messages failed: {exc}", file=sys.stderr)
        return json.dumps({"status": "error", "error": str(exc), "messages": []})


@tool
def get_inbox_message(message_id: str) -> str:
    """
    Read one Gmail message by id (full subject/from/date + plain-text body).
    Use after list_inbox_messages to inspect a customer reply.

    Args:
        message_id: Gmail message id from list_inbox_messages.

    Returns:
        JSON with id, from, subject, date, body, snippet.
    """
    from tools.google_auth import GMAIL_SCOPES, build_google_service, google_oauth_configured

    mid = (message_id or "").strip()
    if not mid:
        return json.dumps({"status": "error", "error": "message_id is required"})

    if not google_oauth_configured():
        return json.dumps({
            "status": "skipped",
            "reason": "Gmail OAuth not configured",
            "id": mid,
        })

    try:
        service = build_google_service("gmail", "v1", GMAIL_SCOPES)
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=mid, format="full")
            .execute()
        )
        payload = msg.get("payload") or {}
        headers = _header_map(payload)
        body = _extract_plain_text(payload)
        # Cap body for agent context
        if len(body) > 4000:
            body = body[:4000] + "\n…[truncated]"
        return json.dumps({
            "status": "ok",
            "provider": "gmail",
            "id": mid,
            "thread_id": msg.get("threadId") or "",
            "from": headers.get("from", ""),
            "subject": headers.get("subject", ""),
            "date": headers.get("date", ""),
            "snippet": msg.get("snippet") or "",
            "body": body.strip(),
        })
    except Exception as exc:
        print(f"[email_tool] get_inbox_message failed: {exc}", file=sys.stderr)
        return json.dumps({"status": "error", "error": str(exc), "id": mid})
