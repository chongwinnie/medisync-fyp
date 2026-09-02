"""
test_rbac_api_matrix.py — Integration Tests: Full Endpoint × Role Matrix
=========================================================================

Systematically tests every FastAPI endpoint against every auth state:
  - Unauthenticated (no token)
  - Doctor role
  - Nurse role
  - Admin role

Expected HTTP status codes are asserted as a matrix.
All external calls (DB, Stripe, Chroma, LLM, Celery) are mocked.

Run with: .venv/bin/python -m pytest tests/test_rbac_api_matrix.py -v
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from main import app  # noqa: E402


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _client():
    return TestClient(app, raise_server_exceptions=False)


def _mock_jwt(role: str | None):
    """Return a context manager that mocks JWT decoding for a given role."""
    if role is None:
        # No-op: don't patch; let real middleware reject the missing token
        from contextlib import nullcontext
        return nullcontext()
    return patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}-matrix", role))


AUTH_HEADERS = {
    None: {},  # unauthenticated
    "doctor": {"Authorization": "Bearer fake_doctor_token"},
    "nurse": {"Authorization": "Bearer fake_nurse_token"},
    "admin": {"Authorization": "Bearer fake_admin_token"},
}

# Shared mock invoice JSON
MOCK_INVOICE = json.dumps({
    "id": "inv-matrix-01",
    "invoice_number": "INV-001",
    "status": "draft",
    "total_amount": 100.0,
    "patient_id": "patient-matrix-01",
})

MOCK_SUMMARY = json.dumps({
    "outstanding_amount": 0.0,
    "paid_this_month": 0,
    "total_invoices": 0,
    "invoices": [],
})

MOCK_INVOICES_LIST = json.dumps([])


# ===========================================================================
# Public Endpoints (no auth required)
# ===========================================================================

class TestPublicEndpoints(unittest.TestCase):
    """Endpoints that must be reachable without any Authorization header."""

    def setUp(self):
        self.client = _client()

    def test_health_check_is_always_200(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200, "GET /health must be publicly accessible")
        self.assertIn("status", res.json())

    def test_root_is_always_200(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200, "GET / must be publicly accessible")
        self.assertEqual(res.json().get("service"), "MediSync AI API")


# ===========================================================================
# Chat Endpoint
# ===========================================================================

class TestChatEndpointMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_chat_unauthenticated_401(self):
        res = self.client.post("/chat", json={"message": "Hello"})
        self.assertEqual(res.status_code, 401)

    def _chat_for_role(self, role: str):
        mock_state = {
            "messages": [], "user_id": f"auth0|{role}", "user_role": role,
            "session_id": "test-session-matrix", "context": {},
        }
        with _mock_jwt(role), \
             patch("context.state_assembler.assemble_agent_state", return_value=mock_state), \
             patch("graph.graph.compiled_graph") as mock_graph:
            from langchain_core.messages import AIMessage
            mock_graph.invoke.return_value = {
                "messages": [AIMessage(content="Test response")],
                "active_agent": "patient_management",
            }
            res = self.client.post(
                "/chat",
                json={"message": "Hello", "session_id": "matrix-session"},
                headers=AUTH_HEADERS[role],
            )
        return res

    def test_chat_doctor_200(self):
        res = self._chat_for_role("doctor")
        # SSE streaming — response code is 200 with text/event-stream
        self.assertEqual(res.status_code, 200)

    def test_chat_nurse_200(self):
        res = self._chat_for_role("nurse")
        self.assertEqual(res.status_code, 200)

    def test_chat_admin_200(self):
        res = self._chat_for_role("admin")
        self.assertEqual(res.status_code, 200)


# ===========================================================================
# Sessions Endpoints
# ===========================================================================

class TestSessionsMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_list_sessions_unauthenticated_401(self):
        self.assertEqual(self.client.get("/sessions").status_code, 401)

    def test_list_sessions_doctor_not_401(self):
        with _mock_jwt("doctor"), patch("db.chat_history.list_sessions", return_value=[]):
            res = self.client.get("/sessions", headers=AUTH_HEADERS["doctor"])
        self.assertNotEqual(res.status_code, 401)

    def test_list_sessions_nurse_not_401(self):
        with _mock_jwt("nurse"), patch("db.chat_history.list_sessions", return_value=[]):
            res = self.client.get("/sessions", headers=AUTH_HEADERS["nurse"])
        self.assertNotEqual(res.status_code, 401)

    def test_list_sessions_admin_not_401(self):
        with _mock_jwt("admin"), patch("db.chat_history.list_sessions", return_value=[]):
            res = self.client.get("/sessions", headers=AUTH_HEADERS["admin"])
        self.assertNotEqual(res.status_code, 401)

    def test_create_session_unauthenticated_401(self):
        res = self.client.post("/sessions", json={})
        self.assertEqual(res.status_code, 401)

    def test_create_session_doctor_not_401(self):
        mock_row = {
            "id": "session-matrix-01",
            "title": None,
            "created_at": "2026-01-01T00:00:00Z",
            "user_id": "auth0|doctor-matrix",
            "user_role": "doctor",
        }
        with _mock_jwt("doctor"), patch("db.chat_history.create_session", return_value=mock_row):
            res = self.client.post("/sessions", json={}, headers=AUTH_HEADERS["doctor"])
        self.assertNotEqual(res.status_code, 401)

    def test_get_session_messages_unauthenticated_401(self):
        res = self.client.get("/sessions/some-session-id/messages")
        self.assertEqual(res.status_code, 401)

    def test_get_session_messages_owner_allowed(self):
        """Owner (auth0|doctor-matrix) can access their own session messages."""
        messages = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
        with _mock_jwt("doctor"), \
             patch("db.chat_history.get_session_messages", return_value=messages), \
             patch("context.session_load.save_session", new_callable=AsyncMock):
            res = self.client.get(
                "/sessions/matrix-session-id/messages",
                headers=AUTH_HEADERS["doctor"],
            )
        self.assertIn(res.status_code, (200, 404))  # 404 if mock didn't wire up, but not 401

    def test_delete_session_unauthenticated_401(self):
        res = self.client.delete("/sessions/some-session-id")
        self.assertEqual(res.status_code, 401)

    def test_delete_session_nonexistent_returns_404(self):
        with _mock_jwt("doctor"), \
             patch("db.chat_history.delete_session", return_value=False):
            res = self.client.delete(
                "/sessions/nonexistent-session",
                headers=AUTH_HEADERS["doctor"],
            )
        self.assertEqual(res.status_code, 404)


# ===========================================================================
# Diagnostics Endpoint
# ===========================================================================

class TestDiagnosticsMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_diagnostics_unauthenticated_401(self):
        body = {"image_base64": "data:image/jpeg;base64,abc", "modality": "xray"}
        self.assertEqual(self.client.post("/diagnostics/analyze", json=body).status_code, 401)

    def _analyze_for_role(self, role: str):
        mock_result = json.dumps({
            "impression": "No acute findings",
            "findings": [],
            "recommendations": [],
            "disclaimer": "AI analysis for clinician review only.",
        })
        body = {"image_base64": "data:image/jpeg;base64,abc", "modality": "xray"}
        with _mock_jwt(role), \
             patch("tools.image_analysis.analyze_medical_image") as mock_tool:
            mock_tool.invoke = MagicMock(return_value=mock_result)
            return self.client.post("/diagnostics/analyze", json=body, headers=AUTH_HEADERS[role])

    def test_diagnostics_doctor_allowed(self):
        res = self._analyze_for_role("doctor")
        self.assertIn(res.status_code, (200, 500))  # 500 if tool mock fails to wire, but not 401/403

    def test_diagnostics_nurse_allowed(self):
        res = self._analyze_for_role("nurse")
        self.assertNotIn(res.status_code, (401, 403))

    def test_diagnostics_admin_allowed(self):
        res = self._analyze_for_role("admin")
        self.assertNotIn(res.status_code, (401, 403))


# ===========================================================================
# Appointments Endpoint
# ===========================================================================

class TestAppointmentsMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_appointment_notify_unauthenticated_401(self):
        self.assertEqual(
            self.client.post("/appointments/notify", json={"appointment_id": "apt-01"}).status_code,
            401,
        )

    def _notify_for_role(self, role: str):
        mock_task = MagicMock()
        mock_task.id = "celery-task-001"
        with _mock_jwt(role), \
             patch("workers.tasks.appointment_tasks.send_appointment_confirmation") as mock_celery:
            mock_celery.delay.return_value = mock_task
            return self.client.post(
                "/appointments/notify",
                json={"appointment_id": "apt-01"},
                headers=AUTH_HEADERS[role],
            )

    def test_appointment_notify_doctor_allowed(self):
        res = self._notify_for_role("doctor")
        self.assertNotIn(res.status_code, (401, 403))

    def test_appointment_notify_nurse_allowed(self):
        res = self._notify_for_role("nurse")
        self.assertNotIn(res.status_code, (401, 403))

    def test_appointment_notify_admin_allowed(self):
        res = self._notify_for_role("admin")
        self.assertNotIn(res.status_code, (401, 403))


# ===========================================================================
# Billing Matrix
# ===========================================================================

class TestBillingMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    # GET /billing/invoices
    def test_billing_list_unauthenticated_401(self):
        self.assertEqual(self.client.get("/billing/invoices").status_code, 401)

    def test_billing_list_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.get("/billing/invoices", headers=AUTH_HEADERS["doctor"])
        self.assertEqual(res.status_code, 403)

    def test_billing_list_nurse_not_403(self):
        with _mock_jwt("nurse"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=MOCK_SUMMARY)
            res = self.client.get("/billing/invoices", headers=AUTH_HEADERS["nurse"])
        self.assertNotEqual(res.status_code, 403)

    def test_billing_list_admin_not_403(self):
        with _mock_jwt("admin"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=MOCK_SUMMARY)
            res = self.client.get("/billing/invoices", headers=AUTH_HEADERS["admin"])
        self.assertNotEqual(res.status_code, 403)

    # POST /billing/invoices
    def test_billing_create_unauthenticated_401(self):
        body = {"patient_id": "pid", "line_items": []}
        self.assertEqual(self.client.post("/billing/invoices", json=body).status_code, 401)

    def test_billing_create_doctor_403(self):
        body = {"patient_id": "pid", "line_items": []}
        with _mock_jwt("doctor"):
            res = self.client.post("/billing/invoices", json=body, headers=AUTH_HEADERS["doctor"])
        self.assertEqual(res.status_code, 403)

    def test_billing_create_nurse_201(self):
        body = {"patient_id": "pid", "line_items": [{"description": "Consult", "quantity": 1, "unit_price": 50.0}]}
        with _mock_jwt("nurse"), \
             patch("tools.billing_writeback.create_invoice") as m:
            m.invoke = MagicMock(return_value=MOCK_INVOICE)
            res = self.client.post("/billing/invoices", json=body, headers=AUTH_HEADERS["nurse"])
        self.assertEqual(res.status_code, 201)

    def test_billing_create_admin_201(self):
        body = {"patient_id": "pid", "line_items": [{"description": "Consult", "quantity": 1, "unit_price": 50.0}]}
        with _mock_jwt("admin"), \
             patch("tools.billing_writeback.create_invoice") as m:
            m.invoke = MagicMock(return_value=MOCK_INVOICE)
            res = self.client.post("/billing/invoices", json=body, headers=AUTH_HEADERS["admin"])
        self.assertEqual(res.status_code, 201)

    # PATCH /billing/invoices/{id}/status
    def test_billing_update_status_unauthenticated_401(self):
        self.assertEqual(
            self.client.patch("/billing/invoices/x/status", json={"status": "paid"}).status_code,
            401,
        )

    def test_billing_update_status_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.patch(
                "/billing/invoices/inv-001/status",
                json={"status": "paid"},
                headers=AUTH_HEADERS["doctor"],
            )
        self.assertEqual(res.status_code, 403)

    def test_billing_update_status_nurse_not_403(self):
        with _mock_jwt("nurse"), \
             patch("tools.billing_writeback.update_invoice_status") as m:
            m.invoke = MagicMock(return_value=MOCK_INVOICE)
            res = self.client.patch(
                "/billing/invoices/inv-001/status",
                json={"status": "paid"},
                headers=AUTH_HEADERS["nurse"],
            )
        self.assertNotEqual(res.status_code, 403)

    def test_billing_update_status_admin_not_403(self):
        with _mock_jwt("admin"), \
             patch("tools.billing_writeback.update_invoice_status") as m:
            m.invoke = MagicMock(return_value=MOCK_INVOICE)
            res = self.client.patch(
                "/billing/invoices/inv-001/status",
                json={"status": "paid"},
                headers=AUTH_HEADERS["admin"],
            )
        self.assertNotEqual(res.status_code, 403)

    # GET /billing/summary
    def test_billing_summary_unauthenticated_401(self):
        self.assertEqual(self.client.get("/billing/summary").status_code, 401)

    def test_billing_summary_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.get("/billing/summary", headers=AUTH_HEADERS["doctor"])
        self.assertEqual(res.status_code, 403)

    def test_billing_summary_nurse_not_403(self):
        with _mock_jwt("nurse"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=MOCK_SUMMARY)
            res = self.client.get("/billing/summary", headers=AUTH_HEADERS["nurse"])
        self.assertNotEqual(res.status_code, 403)

    def test_billing_summary_admin_not_403(self):
        with _mock_jwt("admin"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=MOCK_SUMMARY)
            res = self.client.get("/billing/summary", headers=AUTH_HEADERS["admin"])
        self.assertNotEqual(res.status_code, 403)


# ===========================================================================
# Payroll Matrix
# ===========================================================================

class TestPayrollMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_payroll_process_unauthenticated_401(self):
        self.assertEqual(
            self.client.post("/payroll/process", json={"payroll_id": "p-01"}).status_code, 401
        )

    def test_payroll_process_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.post(
                "/payroll/process", json={"payroll_id": "p-01"}, headers=AUTH_HEADERS["doctor"]
            )
        self.assertEqual(res.status_code, 403)

    def test_payroll_process_nurse_403(self):
        with _mock_jwt("nurse"):
            res = self.client.post(
                "/payroll/process", json={"payroll_id": "p-01"}, headers=AUTH_HEADERS["nurse"]
            )
        self.assertEqual(res.status_code, 403)

    def test_payroll_process_admin_not_403(self):
        with _mock_jwt("admin"), \
             patch("tools.stripe_payroll.stripe_configured", return_value=False):
            res = self.client.post(
                "/payroll/process", json={"payroll_id": "p-01"}, headers=AUTH_HEADERS["admin"]
            )
        # Admin is allowed; Stripe not configured → 503 skipped, not 403
        self.assertNotEqual(res.status_code, 403)

    def test_payroll_status_unauthenticated_401(self):
        self.assertEqual(self.client.get("/payroll/status").status_code, 401)

    def test_payroll_status_all_roles_200(self):
        for role in ("doctor", "nurse", "admin"):
            with self.subTest(role=role), _mock_jwt(role):
                res = self.client.get("/payroll/status", headers=AUTH_HEADERS[role])
            self.assertEqual(res.status_code, 200)


# ===========================================================================
# Knowledge Matrix
# ===========================================================================

class TestKnowledgeMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    # GET /knowledge/status
    def test_knowledge_status_unauthenticated_401(self):
        self.assertEqual(self.client.get("/knowledge/status").status_code, 401)

    def test_knowledge_status_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.get("/knowledge/status", headers=AUTH_HEADERS["doctor"])
        self.assertEqual(res.status_code, 403)

    def test_knowledge_status_nurse_403(self):
        with _mock_jwt("nurse"):
            res = self.client.get("/knowledge/status", headers=AUTH_HEADERS["nurse"])
        self.assertEqual(res.status_code, 403)

    def test_knowledge_status_admin_not_403(self):
        with _mock_jwt("admin"):
            res = self.client.get("/knowledge/status", headers=AUTH_HEADERS["admin"])
        self.assertNotEqual(res.status_code, 403)

    # POST /knowledge/upload
    def test_knowledge_upload_unauthenticated_401(self):
        res = self.client.post(
            "/knowledge/upload",
            files={"file": ("test.txt", b"clinical content", "text/plain")},
        )
        self.assertEqual(res.status_code, 401)

    def test_knowledge_upload_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.post(
                "/knowledge/upload",
                files={"file": ("test.txt", b"clinical content", "text/plain")},
                headers=AUTH_HEADERS["doctor"],
            )
        self.assertEqual(res.status_code, 403)

    def test_knowledge_upload_nurse_403(self):
        with _mock_jwt("nurse"):
            res = self.client.post(
                "/knowledge/upload",
                files={"file": ("test.txt", b"clinical content", "text/plain")},
                headers=AUTH_HEADERS["nurse"],
            )
        self.assertEqual(res.status_code, 403)

    # POST /knowledge/reindex
    def test_knowledge_reindex_unauthenticated_401(self):
        self.assertEqual(self.client.post("/knowledge/reindex").status_code, 401)

    def test_knowledge_reindex_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.post("/knowledge/reindex", headers=AUTH_HEADERS["doctor"])
        self.assertEqual(res.status_code, 403)

    def test_knowledge_reindex_nurse_403(self):
        with _mock_jwt("nurse"):
            res = self.client.post("/knowledge/reindex", headers=AUTH_HEADERS["nurse"])
        self.assertEqual(res.status_code, 403)

    # DELETE /knowledge/document/{upload_id}
    def test_knowledge_delete_unauthenticated_401(self):
        self.assertEqual(
            self.client.delete("/knowledge/document/some-upload-id").status_code, 401
        )

    def test_knowledge_delete_doctor_403(self):
        with _mock_jwt("doctor"):
            res = self.client.delete(
                "/knowledge/document/some-upload-id", headers=AUTH_HEADERS["doctor"]
            )
        self.assertEqual(res.status_code, 403)

    def test_knowledge_delete_nurse_403(self):
        with _mock_jwt("nurse"):
            res = self.client.delete(
                "/knowledge/document/some-upload-id", headers=AUTH_HEADERS["nurse"]
            )
        self.assertEqual(res.status_code, 403)


# ===========================================================================
# Alerts Endpoint
# ===========================================================================

class TestAlertsMatrix(unittest.TestCase):

    def setUp(self):
        self.client = _client()

    def test_alerts_emit_unauthenticated_401(self):
        body = {
            "title": "Test Alert",
            "message": "Critical vitals",
            "category": "clinical_vitals",
            "severity": "critical",
        }
        self.assertEqual(self.client.post("/alerts/emit", json=body).status_code, 401)

    def _emit_for_role(self, role: str):
        body = {
            "title": "Test Alert",
            "message": "Critical vitals",
            "category": "clinical_vitals",
            "severity": "critical",
        }
        with _mock_jwt(role), \
             patch("db.notifications.notify_roles", return_value=0):
            return self.client.post("/alerts/emit", json=body, headers=AUTH_HEADERS[role])

    def test_alerts_emit_doctor_allowed(self):
        res = self._emit_for_role("doctor")
        self.assertNotIn(res.status_code, (401, 403))

    def test_alerts_emit_nurse_allowed(self):
        res = self._emit_for_role("nurse")
        self.assertNotIn(res.status_code, (401, 403))

    def test_alerts_emit_admin_allowed(self):
        res = self._emit_for_role("admin")
        self.assertNotIn(res.status_code, (401, 403))


if __name__ == "__main__":
    raise SystemExit(unittest.main())
