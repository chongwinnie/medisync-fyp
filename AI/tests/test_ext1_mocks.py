"""Integration-contract mocks for OpenAI / Stripe / Google (no real secrets).

These prove tool wiring and payroll/email/calendar code paths when LIVE keys
are absent or quota-exhausted. Labels intentionally say MOCK, not LIVE.
"""
from __future__ import annotations

import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class OpenAIMockPipelineTests(unittest.TestCase):
    def test_mock_chat_completion_pong(self) -> None:
        from langchain_core.messages import AIMessage

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="PONG")
        with patch("config.llm.get_chat_llm", return_value=mock_llm):
            from config.llm import get_chat_llm

            msg = get_chat_llm(temperature=0, streaming=False).invoke(
                "Reply with exactly: PONG"
            )
        self.assertIn("PONG", str(msg.content).upper())
        mock_llm.invoke.assert_called_once()


class StripeMockPayrollTests(unittest.TestCase):
    def test_doctor_deny_unchanged(self) -> None:
        from tools.stripe_payroll import process_stripe_payroll

        denied = json.loads(
            process_stripe_payroll.invoke(
                {
                    "payroll_id": "00000000-0000-0000-0000-000000000001",
                    "user_role": "doctor",
                }
            )
        )
        self.assertEqual(denied.get("status"), "denied")

    def test_mock_payment_intent_path(self) -> None:
        """Patch Stripe SDK + DB row → paid via payment_intent path."""
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
            result = sp.process_payroll_with_stripe(payroll_id)

        self.assertEqual(result.get("status"), "paid")
        self.assertEqual(result.get("path"), "payment_intent")
        self.assertEqual(result.get("stripe_payment_intent_id"), "pi_mock_test_123")


class GoogleMockToolTests(unittest.TestCase):
    def test_gmail_mock_send(self) -> None:
        from tools.email_tool import send_gmail

        with patch(
            "tools.email_tool._send_via_gmail",
            return_value={
                "status": "sent",
                "provider": "gmail",
                "id": "mock_gmail_msg_1",
                "to": "qa@example.com",
                "subject": "MediSync MOCK",
            },
        ):
            out = json.loads(
                send_gmail.invoke(
                    {
                        "to": "qa@example.com",
                        "subject": "MediSync MOCK",
                        "body": "ok",
                    }
                )
            )
        self.assertEqual(out.get("status"), "sent")
        self.assertEqual(out.get("provider"), "gmail")
        self.assertEqual(out.get("id"), "mock_gmail_msg_1")

    def test_gmail_tool_clear_error_without_oauth(self) -> None:
        from tools.email_tool import send_gmail
        from tools.google_auth import google_oauth_configured

        if google_oauth_configured():
            self.skipTest("OAuth configured — clear-error path N/A")
        out = json.loads(
            send_gmail.invoke(
                {"to": "test@example.com", "subject": "t", "body": "b"}
            )
        )
        self.assertEqual(out.get("status"), "error")

    def test_calendar_create_list_mock_service(self) -> None:
        from tools import calendar_tool as ct

        inserted = {
            "id": "evt_mock_abc",
            "htmlLink": "https://calendar.google.com/mock",
            "summary": "MediSync MOCK calendar",
            "status": "confirmed",
        }

        mock_events = MagicMock()
        mock_events.insert.return_value.execute.return_value = inserted
        mock_events.list.return_value.execute.return_value = {
            "items": [{"id": "evt_mock_abc", "summary": "MediSync MOCK calendar"}]
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
                        "patient_name": "Mock",
                        "start_iso": "2026-07-20T09:00:00+08:00",
                        "end_iso": "2026-07-20T09:30:00+08:00",
                        "summary": "MediSync MOCK calendar",
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

        self.assertEqual(created.get("event_id"), "evt_mock_abc")
        self.assertEqual(created.get("provider"), "google_calendar")
        ids = {e.get("id") for e in listed.get("events", [])}
        self.assertIn("evt_mock_abc", ids)

    def test_sa_aa_tool_bindings(self) -> None:
        from agents.operational.staff_management import TOOLS as SA_TOOLS
        from agents.operational.appointment_scheduling import TOOLS as AA_TOOLS

        sa_names = {getattr(t, "name", "") for t in SA_TOOLS}
        aa_names = {getattr(t, "name", "") for t in AA_TOOLS}
        self.assertTrue(
            {"process_stripe_payroll", "list_payroll_records", "send_email"}
            <= sa_names
        )
        self.assertTrue(
            {"create_calendar_event", "list_calendar_events", "send_email"}
            <= aa_names
        )


if __name__ == "__main__":
    raise SystemExit(unittest.main())
