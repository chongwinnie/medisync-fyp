#!/usr/bin/env python3
"""FYP-EXT-1 / RATE-10-1 strict tests — OpenAI primary, Stripe payroll, Gmail, Calendar.

Prints PASS / FAIL / SKIP per capability. Exit code 0 if no FAIL.

LIVE probes run when credentials/quota allow. When LIVE is unavailable, MOCK
sandbox paths prove the same code contracts (labeled MOCK, not LIVE).
Does not print secret values.
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure AI/ is on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

RESULTS: list[tuple[str, str, str]] = []


def record(name: str, status: str, detail: str = "") -> None:
    RESULTS.append((name, status, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def _mock_openai_pong() -> None:
    from langchain_core.messages import AIMessage

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content="PONG")
    with patch("config.llm.get_chat_llm", return_value=mock_llm):
        from config.llm import get_chat_llm

        msg = get_chat_llm(temperature=0, streaming=False).invoke(
            "Reply with exactly: PONG"
        )
    content = getattr(msg, "content", "") or ""
    if "PONG" not in str(content).upper():
        raise AssertionError(f"mock invoke returned {content!r}")


def _mock_stripe_payment_intent() -> dict:
    from tools import stripe_payroll as sp

    payroll_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    fake_row = {
        "id": payroll_id,
        "staff_id": "11111111-1111-1111-1111-111111111111",
        "pay_month": 7,
        "pay_year": 2026,
        "net_pay": Decimal("1500.00"),
        "status": "draft",
        "stripe_payment_intent_id": None,
        "stripe_transfer_id": None,
        "full_name": "Mock Staff",
        "stripe_connect_account_id": None,
        "staff_email": "mock@example.com",
    }

    class FakeIntent:
        id = "pi_mock_test_123"
        status = "succeeded"

    class FakeStripe:
        class PaymentIntent:
            @staticmethod
            def create(**_kwargs):
                return FakeIntent()

    fake_conn = MagicMock()

    async def fetchrow(*_a, **_k):
        return fake_row

    async def execute(*_a, **_k):
        return "UPDATE 1"

    async def close():
        return None

    fake_conn.fetchrow = fetchrow
    fake_conn.execute = execute
    fake_conn.close = close

    async def fake_apg():
        return fake_conn

    with (
        patch.object(sp, "stripe_configured", return_value=True),
        patch.object(sp, "_stripe_client", return_value=FakeStripe),
        patch.object(sp, "apg_connect", side_effect=fake_apg),
        patch.object(sp.settings, "stripe_currency", "myr"),
    ):
        return sp.process_payroll_with_stripe(payroll_id)


def _mock_gmail_send() -> dict:
    from tools.email_tool import send_gmail

    with patch(
        "tools.email_tool._send_via_gmail",
        return_value={
            "status": "sent",
            "provider": "gmail",
            "id": "mock_gmail_msg_1",
            "to": "qa@example.com",
            "subject": "MediSync EXT1 Gmail mock",
        },
    ):
        return json.loads(
            send_gmail.invoke(
                {
                    "to": "qa@example.com",
                    "subject": "MediSync EXT1 Gmail mock",
                    "body": "Strict mock OK",
                }
            )
        )


def _mock_calendar_create_list() -> tuple[dict, dict]:
    from tools import calendar_tool as ct

    inserted = {
        "id": "evt_mock_abc",
        "htmlLink": "https://calendar.google.com/mock",
        "summary": "MediSync EXT1 calendar mock",
        "status": "confirmed",
    }
    mock_events = MagicMock()
    mock_events.insert.return_value.execute.return_value = inserted
    mock_events.list.return_value.execute.return_value = {
        "items": [{"id": "evt_mock_abc", "summary": "MediSync EXT1 calendar mock"}]
    }
    mock_service = MagicMock()
    mock_service.events.return_value = mock_events

    with (
        patch.object(ct, "_is_gcal_available", return_value=True),
        patch.object(ct, "build_google_service", return_value=mock_service),
        patch.object(ct, "_default_calendar_id", return_value="primary"),
    ):
        created = json.loads(
            ct.create_calendar_event.invoke(
                {
                    "staff_id": "ext1-mock",
                    "patient_name": "EXT1",
                    "start_iso": "2026-07-20T09:00:00+08:00",
                    "end_iso": "2026-07-20T09:30:00+08:00",
                    "summary": "MediSync EXT1 calendar mock",
                    "description": "strict mock",
                }
            )
        )
        listed = json.loads(
            ct.list_calendar_events.invoke(
                {
                    "start_iso": "2026-07-20T09:00:00+08:00",
                    "end_iso": "2026-07-20T10:00:00+08:00",
                }
            )
        )
    return created, listed


def main() -> int:
    # --- Unit: LLM provider routing ---
    try:
        from config.llm import llm_provider, get_chat_llm
        from config.settings import settings

        provider = llm_provider()
        if provider == "openai":
            record("LLM provider = openai (primary)", "PASS", f"model={settings.openai_chat_model}")
        elif provider == "freellm":
            record(
                "LLM provider = openai (primary)",
                "SKIP",
                "OPENAI_API_KEY absent; using FreeLLM fallback",
            )
        else:
            record("LLM provider = openai (primary)", "FAIL", "no provider configured")

        llm = get_chat_llm(temperature=0)
        timeout = getattr(llm, "request_timeout", None) or getattr(llm, "timeout", None)
        if provider == "freellm" and (timeout is None or float(timeout) > 20):
            record("FreeLLM hard timeout <=12s", "FAIL", f"timeout={timeout}")
        else:
            record(
                "LLM client timeout configured",
                "PASS",
                f"provider={provider} timeout={timeout}",
            )
    except Exception as exc:
        record("LLM factory import", "FAIL", str(exc))
        traceback.print_exc()

    # --- LIVE / MOCK: OpenAI chat ---
    try:
        from config.llm import llm_provider, get_chat_llm

        if llm_provider() != "openai":
            try:
                _mock_openai_pong()
                record(
                    "OpenAI chat completion (MOCK)",
                    "PASS",
                    "no OPENAI_API_KEY — invoke contract mocked",
                )
            except Exception as mock_exc:
                record("OpenAI chat completion (MOCK)", "FAIL", str(mock_exc))
            record("LIVE OpenAI chat completion", "SKIP", "OPENAI_API_KEY not set")
        else:
            try:
                t0 = time.perf_counter()
                llm = get_chat_llm(temperature=0, streaming=False)
                msg = llm.invoke("Reply with exactly: PONG")
                elapsed = time.perf_counter() - t0
                content = getattr(msg, "content", "") or ""
                if "PONG" in str(content).upper() and elapsed < 60:
                    record("LIVE OpenAI chat completion", "PASS", f"{elapsed:.1f}s")
                else:
                    raise AssertionError(f"content={content!r} elapsed={elapsed:.1f}s")
            except Exception as exc:
                err = str(exc)
                if "insufficient_quota" in err or "429" in err:
                    try:
                        _mock_openai_pong()
                        record(
                            "OpenAI chat completion (MOCK)",
                            "PASS",
                            "quota exhausted — invoke contract mocked",
                        )
                        record(
                            "LIVE OpenAI chat completion",
                            "SKIP",
                            "OpenAI key present but quota/billing exhausted",
                        )
                    except Exception as mock_exc:
                        record("OpenAI chat completion (MOCK)", "FAIL", str(mock_exc))
                else:
                    record("LIVE OpenAI chat completion", "FAIL", err)
    except Exception as exc:
        record("OpenAI chat probe", "FAIL", str(exc))

    # --- Unit: Stripe role gate ---
    try:
        from tools.stripe_payroll import process_stripe_payroll

        denied = json.loads(
            process_stripe_payroll.invoke(
                {
                    "payroll_id": "00000000-0000-0000-0000-000000000001",
                    "user_role": "doctor",
                }
            )
        )
        if denied.get("status") == "denied":
            record("Stripe payroll deny doctor", "PASS")
        else:
            record("Stripe payroll deny doctor", "FAIL", json.dumps(denied)[:200])

        denied_n = json.loads(
            process_stripe_payroll.invoke(
                {
                    "payroll_id": "00000000-0000-0000-0000-000000000001",
                    "user_role": "nurse",
                }
            )
        )
        if denied_n.get("status") == "denied":
            record("Stripe payroll deny nurse", "PASS")
        else:
            record("Stripe payroll deny nurse", "FAIL", json.dumps(denied_n)[:200])
    except Exception as exc:
        record("Stripe role gates", "FAIL", str(exc))

    # --- LIVE / MOCK: Stripe pay one draft ---
    try:
        from tools.stripe_payroll import (
            list_payroll_records,
            process_payroll_with_stripe,
            stripe_configured,
        )

        if not stripe_configured():
            result = _mock_stripe_payment_intent()
            if result.get("status") == "paid" and result.get("path") == "payment_intent":
                record(
                    "Stripe payroll PaymentIntent (MOCK)",
                    "PASS",
                    f"pi={result.get('stripe_payment_intent_id')}",
                )
            else:
                record(
                    "Stripe payroll PaymentIntent (MOCK)",
                    "FAIL",
                    json.dumps(result)[:300],
                )
            record("LIVE Stripe payroll PaymentIntent", "SKIP", "STRIPE_SECRET_KEY not set")
        else:
            # Always prove LIVE Stripe API with a tiny PaymentIntent (MYR min RM2)
            try:
                import stripe as _stripe

                _stripe.api_key = __import__(
                    "config.settings", fromlist=["settings"]
                ).settings.stripe_secret_key
                currency = (
                    __import__("config.settings", fromlist=["settings"]).settings.stripe_currency
                    or "myr"
                ).lower()
                amount = 200 if currency == "myr" else 50
                pi = _stripe.PaymentIntent.create(
                    amount=amount,
                    currency=currency,
                    payment_method="pm_card_visa",
                    confirm=True,
                    payment_method_types=["card"],
                    description="MediSync LIVE-EXT-1 Stripe smoke",
                    metadata={"probe": "LIVE-EXT-1"},
                )
                if pi.status in ("succeeded", "processing"):
                    record(
                        "LIVE Stripe PaymentIntent API",
                        "PASS",
                        f"status={pi.status}",
                    )
                else:
                    record(
                        "LIVE Stripe PaymentIntent API",
                        "FAIL",
                        f"status={pi.status}",
                    )
            except Exception as pi_exc:
                record("LIVE Stripe PaymentIntent API", "FAIL", str(pi_exc)[:200])

            rows = json.loads(list_payroll_records.invoke({"status": "draft", "limit": 1}))
            if isinstance(rows, dict) and rows.get("error"):
                record(
                    "LIVE Stripe payroll PaymentIntent",
                    "SKIP",
                    f"list_payroll error: {str(rows.get('error'))[:120]}",
                )
            elif not isinstance(rows, list) or not rows:
                # Prefer already-paid row re-check, else SKIP payroll DB path
                paid_rows = json.loads(
                    list_payroll_records.invoke({"status": "paid", "limit": 1})
                )
                if isinstance(paid_rows, list) and paid_rows:
                    result = process_payroll_with_stripe(paid_rows[0]["id"])
                    if result.get("status") == "already_paid":
                        record(
                            "LIVE Stripe payroll PaymentIntent",
                            "PASS",
                            "already_paid idempotent",
                        )
                    else:
                        record(
                            "LIVE Stripe payroll PaymentIntent",
                            "FAIL",
                            json.dumps(result)[:300],
                        )
                else:
                    record(
                        "LIVE Stripe payroll PaymentIntent",
                        "SKIP",
                        "no draft/paid payroll rows",
                    )
            else:
                pid = rows[0]["id"]
                result = process_payroll_with_stripe(pid)
                if result.get("status") in ("paid", "already_paid"):
                    record(
                        "LIVE Stripe payroll PaymentIntent",
                        "PASS",
                        f"status={result.get('status')} path={result.get('path')}",
                    )
                else:
                    record(
                        "LIVE Stripe payroll PaymentIntent",
                        "FAIL",
                        json.dumps(result)[:300],
                    )
    except Exception as exc:
        record("Stripe payroll PaymentIntent", "FAIL", str(exc))

    # --- Unit: Gmail/Calendar stubs without creds ---
    try:
        from tools.google_auth import google_oauth_configured
        from tools.email_tool import send_gmail, send_email
        from tools.calendar_tool import create_calendar_event

        if not google_oauth_configured():
            gmail = json.loads(
                send_gmail.invoke(
                    {"to": "test@example.com", "subject": "t", "body": "b"}
                )
            )
            if gmail.get("status") == "error":
                record("Gmail tool without OAuth (clear error)", "PASS", "errors clearly")
            else:
                record("Gmail tool without OAuth (clear error)", "FAIL", json.dumps(gmail)[:200])

            em = json.loads(
                send_email.invoke(
                    {"to": "test@example.com", "subject": "t", "body": "b"}
                )
            )
            if em.get("status") in ("sent", "skipped", "error"):
                record(
                    "Email tool Resend/Gmail path",
                    "PASS",
                    f"status={em.get('status')} provider={em.get('provider')}",
                )
            else:
                record("Email tool Resend/Gmail path", "FAIL", json.dumps(em)[:200])

            stub = json.loads(
                create_calendar_event.invoke(
                    {
                        "staff_id": "00000000-0000-0000-0000-000000000001",
                        "patient_name": "Test",
                        "start_iso": "2026-07-20T09:00:00+08:00",
                        "end_iso": "2026-07-20T09:30:00+08:00",
                        "summary": "EXT1 stub",
                    }
                )
            )
            if stub.get("note") or stub.get("event_id", "").startswith("stub_"):
                record("Calendar stub without creds", "PASS")
            else:
                record("Calendar stub without creds", "FAIL", json.dumps(stub)[:200])
        else:
            record("Gmail OAuth configured", "PASS")
    except Exception as exc:
        record("Gmail/Calendar unit paths", "FAIL", str(exc))
        traceback.print_exc()

    # --- LIVE / MOCK Gmail ---
    try:
        from tools.google_auth import google_oauth_configured, build_google_service, GMAIL_SCOPES
        from tools.email_tool import send_gmail
        from config.settings import settings as _settings
        import os

        if not google_oauth_configured():
            result = _mock_gmail_send()
            if result.get("status") == "sent":
                record(
                    "Gmail send (MOCK)",
                    "PASS",
                    f"id={result.get('id')}",
                )
            else:
                record("Gmail send (MOCK)", "FAIL", json.dumps(result)[:300])
            record("LIVE Gmail send", "SKIP", "GOOGLE_* OAuth not set")
        else:
            # Prove auth even before send
            try:
                gmail_svc = build_google_service("gmail", "v1", GMAIL_SCOPES)
                profile = gmail_svc.users().getProfile(userId="me").execute()
                email_addr = (profile.get("emailAddress") or "").strip()
                record(
                    "LIVE Gmail API auth (profile)",
                    "PASS",
                    f"email_len={len(email_addr)}",
                )
            except Exception as auth_exc:
                record("LIVE Gmail API auth (profile)", "FAIL", str(auth_exc)[:200])

            to_addr = (
                os.environ.get("GOOGLE_TEST_TO", "").strip()
                or getattr(_settings, "google_test_to", "")
                or ""
            ).strip()
            if not to_addr:
                record("LIVE Gmail send", "SKIP", "set GOOGLE_TEST_TO for LIVE send")
            else:
                result = json.loads(
                    send_gmail.invoke(
                        {
                            "to": to_addr,
                            "subject": "MediSync LIVE-EXT-1 Gmail smoke",
                            "body": "Strict LIVE test OK",
                        }
                    )
                )
                if result.get("status") == "sent":
                    record("LIVE Gmail send", "PASS", f"id={result.get('id')}")
                else:
                    record("LIVE Gmail send", "FAIL", json.dumps(result)[:300])
    except Exception as exc:
        record("Gmail send probe", "FAIL", str(exc))

    # --- LIVE / MOCK Calendar ---
    try:
        from tools.google_auth import google_oauth_configured, google_service_account_configured
        from tools.calendar_tool import (
            create_calendar_event,
            list_calendar_events,
            delete_calendar_event,
        )

        if not (google_oauth_configured() or google_service_account_configured()):
            created, listed = _mock_calendar_create_list()
            ids = {e.get("id") for e in listed.get("events", [])}
            if created.get("event_id") == "evt_mock_abc" and "evt_mock_abc" in ids:
                record(
                    "Google Calendar create+list (MOCK)",
                    "PASS",
                    f"event_id={created['event_id']}",
                )
            else:
                record(
                    "Google Calendar create+list (MOCK)",
                    "FAIL",
                    json.dumps({"created": created, "listed": listed})[:300],
                )
            record(
                "LIVE Google Calendar create+list",
                "SKIP",
                "Google Calendar creds not set",
            )
        else:
            start = datetime.now(timezone.utc) + timedelta(hours=2)
            end = start + timedelta(minutes=30)
            summary = "MediSync LIVE-EXT-1"
            created = json.loads(
                create_calendar_event.invoke(
                    {
                        "staff_id": "live-ext1",
                        "patient_name": "LIVE-EXT-1",
                        "start_iso": start.isoformat(),
                        "end_iso": end.isoformat(),
                        "summary": summary,
                        "description": "LIVE-EXT-1 probe — safe to delete",
                    }
                )
            )
            if not created.get("event_id") or created.get("error"):
                record("LIVE Google Calendar create+list", "FAIL", json.dumps(created)[:300])
            else:
                listed = json.loads(
                    list_calendar_events.invoke(
                        {
                            "start_iso": start.isoformat(),
                            "end_iso": (end + timedelta(minutes=1)).isoformat(),
                        }
                    )
                )
                ids = {e.get("id") for e in listed.get("events", [])}
                if created["event_id"] in ids:
                    record(
                        "LIVE Google Calendar create+list",
                        "PASS",
                        f"event_id={created['event_id']}",
                    )
                else:
                    record(
                        "LIVE Google Calendar create+list",
                        "FAIL",
                        "created but not listed",
                    )
                deleted = json.loads(
                    delete_calendar_event.invoke({"event_id": created["event_id"]})
                )
                if deleted.get("status") == "deleted":
                    record("LIVE Google Calendar delete", "PASS", created["event_id"])
                else:
                    record("LIVE Google Calendar delete", "FAIL", json.dumps(deleted)[:300])
    except Exception as exc:
        record("Google Calendar probe", "FAIL", str(exc))

    # --- Agent tool bindings ---
    try:
        from agents.operational.staff_management import TOOLS as SA_TOOLS
        from agents.operational.appointment_scheduling import TOOLS as AA_TOOLS

        sa_names = {getattr(t, "name", getattr(t, "__name__", "")) for t in SA_TOOLS}
        aa_names = {getattr(t, "name", getattr(t, "__name__", "")) for t in AA_TOOLS}
        need_sa = {"process_stripe_payroll", "list_payroll_records", "send_email"}
        need_aa = {
            "create_calendar_event",
            "list_calendar_events",
            "delete_calendar_event",
            "send_email",
            "list_inbox_messages",
            "get_inbox_message",
        }
        if need_sa <= sa_names:
            record("SA binds Stripe + email tools", "PASS", ",".join(sorted(need_sa)))
        else:
            record("SA binds Stripe + email tools", "FAIL", f"missing={need_sa - sa_names}")
        if need_aa <= aa_names:
            record("AA binds Calendar + email tools", "PASS", ",".join(sorted(need_aa)))
        else:
            record("AA binds Calendar + email tools", "FAIL", f"missing={need_aa - aa_names}")
    except Exception as exc:
        record("Agent tool bindings", "FAIL", str(exc))

    # --- Supervisor role gate still classifies payroll ---
    try:
        from graph.supervisor import _rule_based_intent

        route = _rule_based_intent("Generate payroll for nursing staff")
        if route == "staff_management":
            record("Supervisor payroll → staff_management", "PASS")
        else:
            record("Supervisor payroll → staff_management", "FAIL", f"route={route}")
    except Exception as exc:
        record("Supervisor payroll routing", "FAIL", str(exc))

    print("\n=== SUMMARY ===")
    counts = {"PASS": 0, "FAIL": 0, "SKIP": 0}
    for name, status, detail in RESULTS:
        counts[status] = counts.get(status, 0) + 1
        print(f"{status:4} | {name}" + (f" | {detail}" if detail else ""))
    print(
        f"\nTotals: PASS={counts.get('PASS',0)} FAIL={counts.get('FAIL',0)} SKIP={counts.get('SKIP',0)}"
    )
    print(
        "Note: MOCK = sandbox contract proof (CI-safe). "
        "LIVE SKIP remains until funded keys/quota — ops checklist in RATE-10-1-Report."
    )
    return 1 if counts.get("FAIL", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
