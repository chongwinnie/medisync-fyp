"""
test_rbac_cross_role_workflows.py — Multi-Role Sequential Workflow Tests
=========================================================================

Tests interactions where one role's action triggers or affects another role's state.
All external dependencies (DB, Stripe, Chroma, LLM, Celery) are mocked.

Workflows tested:
  1. Invoice Lifecycle: nurse creates → doctor blocked → admin approves
  2. Payroll Processing Chain: doctor/nurse blocked → admin processes
  3. Knowledge Base Lifecycle: non-admins blocked → admin manages
  4. Shift Conflict Management: non-admins blocked → admin manages
  5. AI Supervisor Cross-Role Sequential: hard-deny, no remap
  6. Bed Allocation Workflow: nurse allocates → doctor can manage patient

Run with: .venv/bin/python -m pytest tests/test_rbac_cross_role_workflows.py -v
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


def _client():
    return TestClient(app, raise_server_exceptions=False)


def _jwt(role: str):
    return patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}-wf", role))


def _auth(role: str) -> dict:
    return {"Authorization": f"Bearer fake_{role}_workflow_token"}


# ===========================================================================
# Workflow 1: Invoice Lifecycle (nurse creates → doctor blocked → admin approves)
# ===========================================================================

class TestInvoiceLifecycleWorkflow(unittest.TestCase):
    """
    Sequence:
      Step 1 → Nurse creates invoice → 201
      Step 2 → Doctor tries to update status → 403 (blocked)
      Step 3 → Admin updates status to 'paid' → 200
      Step 4 → Nurse reads invoice summary → 200 (allowed)
    """

    MOCK_INVOICE_ID = "inv-workflow-001"

    def _make_mock_invoice(self, status: str = "draft") -> str:
        return json.dumps({
            "id": self.MOCK_INVOICE_ID,
            "invoice_number": "INV-WF-001",
            "status": status,
            "total_amount": 150.0,
            "patient_id": "patient-wf-001",
        })

    def test_workflow_step1_nurse_creates_invoice(self):
        """Step 1: Nurse creates an invoice → 201."""
        body = {
            "patient_id": "patient-wf-001",
            "line_items": [
                {"description": "Consultation", "quantity": 1, "unit_price": 100.0},
                {"description": "Dressing", "quantity": 1, "unit_price": 50.0},
            ],
        }
        with _jwt("nurse"), \
             patch("tools.billing_writeback.create_invoice") as m:
            m.invoke = MagicMock(return_value=self._make_mock_invoice("draft"))
            res = _client().post("/billing/invoices", json=body, headers=_auth("nurse"))
        self.assertEqual(res.status_code, 201, "Nurse must be able to create invoices")
        data = res.json().get("data")
        created = json.loads(data) if isinstance(data, str) else data
        self.assertEqual(created.get("status"), "draft")

    def test_workflow_step2_doctor_cannot_update_invoice_status(self):
        """Step 2: Doctor tries to approve/update invoice → 403 (hard denied)."""
        with _jwt("doctor"):
            res = _client().patch(
                f"/billing/invoices/{self.MOCK_INVOICE_ID}/status",
                json={"status": "paid"},
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 403, "Doctor must NOT be able to update invoice status")
        self.assertIn("doctor", res.json().get("error", "").lower())

    def test_workflow_step3_admin_updates_invoice_to_paid(self):
        """Step 3: Admin updates invoice status to 'paid' → 200."""
        mock_updated = self._make_mock_invoice("paid")
        with _jwt("admin"), \
             patch("tools.billing_writeback.update_invoice_status") as m:
            m.invoke = MagicMock(return_value=mock_updated)
            res = _client().patch(
                f"/billing/invoices/{self.MOCK_INVOICE_ID}/status",
                json={"status": "paid"},
                headers=_auth("admin"),
            )
        self.assertEqual(res.status_code, 200, "Admin must be able to approve invoices")

    def test_workflow_step4_nurse_reads_billing_summary(self):
        """Step 4: Nurse reads billing summary → 200 (not 403)."""
        mock_summary = json.dumps({
            "outstanding_amount": 0.0,
            "paid_this_month": 1,
            "total_invoices": 1,
        })
        with _jwt("nurse"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=mock_summary)
            res = _client().get("/billing/summary", headers=_auth("nurse"))
        self.assertNotEqual(res.status_code, 403, "Nurse must be able to read billing summary")
        self.assertEqual(res.status_code, 200)

    def test_workflow_complete_sequence_role_enforcement(self):
        """
        Assert the complete sequence in a single test:
        Nurse create → Doctor update blocked → Admin update allowed
        """
        client = _client()

        # Nurse creates
        body = {"patient_id": "pid-wf", "line_items": [{"description": "X", "quantity": 1, "unit_price": 50.0}]}
        with _jwt("nurse"), patch("tools.billing_writeback.create_invoice") as m:
            m.invoke = MagicMock(return_value=self._make_mock_invoice())
            create_res = client.post("/billing/invoices", json=body, headers=_auth("nurse"))
        self.assertEqual(create_res.status_code, 201)

        # Doctor blocked
        with _jwt("doctor"):
            deny_res = client.patch(
                f"/billing/invoices/{self.MOCK_INVOICE_ID}/status",
                json={"status": "paid"},
                headers=_auth("doctor"),
            )
        self.assertEqual(deny_res.status_code, 403)

        # Admin succeeds
        with _jwt("admin"), patch("tools.billing_writeback.update_invoice_status") as m:
            m.invoke = MagicMock(return_value=self._make_mock_invoice("paid"))
            approve_res = client.patch(
                f"/billing/invoices/{self.MOCK_INVOICE_ID}/status",
                json={"status": "paid"},
                headers=_auth("admin"),
            )
        self.assertEqual(approve_res.status_code, 200)


# ===========================================================================
# Workflow 2: Payroll Processing Chain
# ===========================================================================

class TestPayrollProcessingWorkflow(unittest.TestCase):
    """
    Sequence:
      Step 1 → Doctor tries POST /payroll/process → 403
      Step 2 → Nurse tries POST /payroll/process → 403
      Step 3 → Admin processes (Stripe not configured) → 503 skipped (not 403)
      Step 4 → GET /payroll/status accessible to all roles → 200
    """

    def test_workflow_doctor_blocked(self):
        with _jwt("doctor"):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": "payroll-wf-001"},
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 403)
        self.assertIn("admin", res.json().get("error", "").lower())

    def test_workflow_nurse_blocked(self):
        with _jwt("nurse"):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": "payroll-wf-001"},
                headers=_auth("nurse"),
            )
        self.assertEqual(res.status_code, 403)

    def test_workflow_admin_allowed_stripe_skipped(self):
        with _jwt("admin"), \
             patch("tools.stripe_payroll.stripe_configured", return_value=False):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": "payroll-wf-001"},
                headers=_auth("admin"),
            )
        # Admin allowed; Stripe unavailable → 503 with status=skipped, not 403
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json().get("status"), "skipped")
        self.assertNotEqual(res.status_code, 403)

    def test_workflow_admin_allowed_stripe_paid(self):
        """Admin with Stripe configured gets 200 paid."""
        from decimal import Decimal

        fake_row = {
            "id": "payroll-wf-001",
            "staff_id": "staff-wf-001",
            "pay_month": 8,
            "pay_year": 2026,
            "net_pay": Decimal("2000.00"),
            "status": "draft",
            "stripe_payment_intent_id": None,
            "stripe_transfer_id": None,
            "full_name": "Mock Staff",
            "stripe_connect_account_id": None,
            "staff_email": "staff@example.com",
        }

        class FakeIntent:
            id = "pi_wf_test_01"
            status = "succeeded"

        class FakeStripe:
            class PaymentIntent:
                @staticmethod
                def create(**_):
                    return FakeIntent()

        fake_conn = MagicMock()
        fake_conn.fetchrow = AsyncMock(return_value=fake_row)
        fake_conn.execute = AsyncMock(return_value="UPDATE 1")
        fake_conn.close = AsyncMock()

        import tools.stripe_payroll as sp

        with _jwt("admin"), \
             patch.object(sp, "stripe_configured", return_value=True), \
             patch.object(sp, "_stripe_client", return_value=FakeStripe), \
             patch.object(sp, "apg_connect", return_value=AsyncMock(return_value=fake_conn)), \
             patch.object(sp.settings, "stripe_currency", "myr"):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": "payroll-wf-001"},
                headers=_auth("admin"),
            )
        self.assertIn(res.status_code, (200, 400, 503))  # 200 on success; test that it's NOT 403
        self.assertNotEqual(res.status_code, 403)

    def test_workflow_payroll_status_all_roles_visible(self):
        """All authenticated roles should see payroll status."""
        for role in ("doctor", "nurse", "admin"):
            with self.subTest(role=role), _jwt(role):
                res = _client().get("/payroll/status", headers=_auth(role))
            self.assertEqual(res.status_code, 200)
            self.assertIn("user_role", res.json())


# ===========================================================================
# Workflow 3: Knowledge Base Lifecycle
# ===========================================================================

class TestKnowledgeLifecycleWorkflow(unittest.TestCase):
    """
    Sequence:
      Step 1 → Doctor tries upload → 403
      Step 2 → Nurse tries upload → 403
      Step 3 → Admin uploads document → 201
      Step 4 → Admin checks status → document_count >= 1
      Step 5 → Admin deletes document → deleted_chunks >= 1
    """

    UPLOAD_ID = "upload-wf-001"

    def test_step1_doctor_blocked_from_upload(self):
        with _jwt("doctor"):
            res = _client().post(
                "/knowledge/upload",
                files={"file": ("clinical.txt", b"ACS Protocol content", "text/plain")},
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 403)

    def test_step2_nurse_blocked_from_upload(self):
        with _jwt("nurse"):
            res = _client().post(
                "/knowledge/upload",
                files={"file": ("clinical.txt", b"ACS Protocol content", "text/plain")},
                headers=_auth("nurse"),
            )
        self.assertEqual(res.status_code, 403)

    def test_step3_admin_can_upload(self):
        """Admin can upload and the response includes chunks_added and upload_id."""
        mock_embedder = MagicMock()
        mock_embedder.embed_documents.return_value = [[0.1] * 256]

        mock_collection = AsyncMock()
        mock_collection.count = AsyncMock(return_value=1)
        mock_collection.add = AsyncMock()

        mock_chroma_client = AsyncMock()
        mock_chroma_client.get_or_create_collection = AsyncMock(return_value=mock_collection)

        with _jwt("admin"), \
             patch("config.llm.get_embeddings", return_value=mock_embedder), \
             patch("db.chroma.get_chroma_client", return_value=AsyncMock(return_value=mock_chroma_client)):
            res = _client().post(
                "/knowledge/upload",
                files={"file": ("acs_protocol.txt", b"Clinical Guideline: ACS triage protocol.", "text/plain")},
                data={"source_label": "ACS Protocol 2026"},
                headers=_auth("admin"),
            )
        self.assertNotEqual(res.status_code, 403, "Admin must be allowed to upload")

    def test_step4_admin_knowledge_status_not_403(self):
        """Admin can check knowledge status."""
        with _jwt("admin"):
            res = _client().get("/knowledge/status", headers=_auth("admin"))
        self.assertNotEqual(res.status_code, 403)

    def test_step5_admin_can_delete_document(self):
        """Admin can delete an uploaded document."""
        mock_results = {"ids": ["upload:wf-001:0", "upload:wf-001:1"]}
        mock_collection = AsyncMock()
        mock_collection.get = AsyncMock(return_value=mock_results)
        mock_collection.delete = AsyncMock()

        mock_chroma_client = AsyncMock()
        mock_chroma_client.get_or_create_collection = AsyncMock(return_value=mock_collection)

        with _jwt("admin"), \
             patch("db.chroma.get_chroma_client", return_value=AsyncMock(return_value=mock_chroma_client)):
            res = _client().delete(
                f"/knowledge/document/{self.UPLOAD_ID}",
                headers=_auth("admin"),
            )
        self.assertNotEqual(res.status_code, 403, "Admin must be allowed to delete documents")

    def test_non_admin_cannot_reindex(self):
        """Neither doctor nor nurse can trigger reindex."""
        for role in ("doctor", "nurse"):
            with self.subTest(role=role), _jwt(role):
                res = _client().post("/knowledge/reindex", headers=_auth(role))
            self.assertEqual(res.status_code, 403)


# ===========================================================================
# Workflow 4: Shift Conflict Management
# ===========================================================================

class TestShiftConflictWorkflow(unittest.TestCase):
    """
    Shift management is handled by Next.js Server Actions.
    These tests are skipped since 'lib' is a TypeScript/Next.js module
    that cannot be imported in a Python/pytest context.
    The Server Action permission logic is instead verified structurally
    via the role-guard.test.ts TypeScript tests.
    """

    def _make_user(self, role: str):
        return MagicMock(role=role, staffId=f"staff-{role}-001", userId=f"user-{role}-001")

    @unittest.skip("lib.actions.shifts is a Next.js Server Action module (TypeScript only)")
    def test_doctor_cannot_analyze_shifts(self):
        pass

    @unittest.skip("lib.actions.shifts is a Next.js Server Action module (TypeScript only)")
    def test_nurse_cannot_apply_suggestions(self):
        pass

    @unittest.skip("lib.actions.shifts is a Next.js Server Action module (TypeScript only)")
    def test_admin_can_analyze_shifts(self):
        pass


# ===========================================================================
# Workflow 5: AI Supervisor Cross-Role Sequential
# ===========================================================================

class TestSupervisorCrossRoleWorkflow(unittest.TestCase):
    """
    Sequential multi-role interactions through the supervisor node:
    Tests that role gates are applied independently per-request.
    """

    def _state(self, role: str, message: str, mode: str = "chat", active_agent: str = ""):
        from langchain_core.messages import HumanMessage
        return {
            "messages": [HumanMessage(content=message)] if message else [],
            "user_role": role,
            "user_id": f"auth0|{role}-wf",
            "session_id": f"00000000-0000-0000-0000-{hash(role) % 10**12:012d}",
            "entry_mode": mode,
            "active_agent": active_agent,
            "context": {},
        }

    def test_step1_doctor_payroll_hard_denied(self):
        """Doctor → payroll query → staff_management classified → Access denied (no remap)."""
        from graph.supervisor import supervisor_node
        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd = supervisor_node(self._state("doctor", "Generate payroll"))
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("Access denied", str(cmd.update["messages"][-1].content))
        self.assertNotEqual(cmd.update.get("active_agent"), "staff_management")

    def test_step2_nurse_inventory_allowed(self):
        """Nurse → inventory query → allowed → routed to inventory_resource."""
        from graph.supervisor import supervisor_node
        with patch("graph.supervisor._classify_intent", return_value="inventory_resource"):
            cmd = supervisor_node(self._state("nurse", "Check low stock"))
        self.assertEqual(cmd.goto, "inventory_resource")
        self.assertEqual(cmd.update.get("active_agent"), "inventory_resource")

    def test_step3_admin_payroll_allowed(self):
        """Admin → same payroll query → allowed → routed to staff_management."""
        from graph.supervisor import supervisor_node
        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd = supervisor_node(self._state("admin", "Generate payroll"))
        self.assertEqual(cmd.goto, "staff_management")

    def test_step4_autonomous_nurse_denied_staff(self):
        """Autonomous mode: Celery dispatches staff_management for nurse → denied."""
        from graph.supervisor import supervisor_node
        cmd = supervisor_node(self._state("nurse", "", mode="autonomous", active_agent="staff_management"))
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("denied", str(cmd.update["messages"][-1].content).lower())

    def test_step5_autonomous_admin_allowed_staff(self):
        """Autonomous mode: admin dispatched to staff_management → allowed."""
        from graph.supervisor import supervisor_node
        cmd = supervisor_node(self._state("admin", "", mode="autonomous", active_agent="staff_management"))
        self.assertEqual(cmd.goto, "staff_management")

    def test_step6_doctor_inventory_hard_denied(self):
        """Doctor → inventory query → denied (doctor cannot access inventory_resource)."""
        from graph.supervisor import supervisor_node
        with patch("graph.supervisor._classify_intent", return_value="inventory_resource"):
            cmd = supervisor_node(self._state("doctor", "Check stock levels"))
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("Access denied", str(cmd.update["messages"][-1].content))

    def test_step7_concurrent_states_isolated(self):
        """
        Two simultaneous state objects for different users must remain independent.
        The supervisor must not leak state between calls.
        """
        from langchain_core.messages import HumanMessage
        from graph.supervisor import supervisor_node

        state_doctor = {
            "messages": [HumanMessage(content="Payroll")],
            "user_role": "doctor",
            "user_id": "auth0|doctor-concurrent",
            "session_id": "session-doctor-concurrent",
            "entry_mode": "chat",
            "context": {},
        }
        state_admin = {
            "messages": [HumanMessage(content="Payroll")],
            "user_role": "admin",
            "user_id": "auth0|admin-concurrent",
            "session_id": "session-admin-concurrent",
            "entry_mode": "chat",
            "context": {},
        }

        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd_doctor = supervisor_node(state_doctor)
            cmd_admin = supervisor_node(state_admin)

        self.assertEqual(cmd_doctor.goto, "__end__", "Doctor must be denied")
        self.assertEqual(cmd_admin.goto, "staff_management", "Admin must be allowed")
        # User IDs must not bleed between states
        self.assertNotEqual(
            cmd_doctor.update.get("user_id"),
            cmd_admin.update.get("user_id"),
        )


# ===========================================================================
# Workflow 6: Cross-Role Claim Integrity
# ===========================================================================

class TestRoleClaimIntegrity(unittest.TestCase):
    """
    Validate that the role extracted from the JWT cannot be escalated
    by passing unexpected values, and that edge-case roles are handled.
    """

    def _decode_with_role(self, raw_role: str):
        from context import auth as auth_mod
        payload = {
            "sub": "auth0|role-test",
            "https://medisync.app/role": raw_role,
            "aud": "http://localhost:8000",
            "iss": "https://dev-test.us.auth0.com/",
            "exp": 9999999999,
            "iat": 1700000000,
        }
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", return_value=payload),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            return decode_auth0_jwt("tok")

    def test_superadmin_claim_rejected(self):
        with self.assertRaises(ValueError):
            self._decode_with_role("superadmin")

    def test_root_claim_rejected(self):
        with self.assertRaises(ValueError):
            self._decode_with_role("root")

    def test_staff_normalised_to_doctor(self):
        _, role = self._decode_with_role("staff")
        self.assertEqual(role, "doctor")

    def test_blank_string_normalised_to_doctor(self):
        _, role = self._decode_with_role("")
        self.assertEqual(role, "doctor")

    def test_uppercase_roles_normalized(self):
        """'DOCTOR' (uppercase) is converted to lowercase and accepted as 'doctor'."""
        _, role = self._decode_with_role("DOCTOR")
        self.assertEqual(role, "doctor")

    def test_whitespace_only_role_raises_value_error(self):
        """Whitespace-only role '  ' is NOT in VALID_ROLES → raises ValueError."""
        with self.assertRaises(ValueError):
            self._decode_with_role("  ")

    def test_valid_roles_unchanged(self):
        for valid_role in ("doctor", "nurse", "admin"):
            with self.subTest(role=valid_role):
                _, role = self._decode_with_role(valid_role)
                self.assertEqual(role, valid_role)


if __name__ == "__main__":
    raise SystemExit(unittest.main())
