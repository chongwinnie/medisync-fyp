"""
test_rbac_unit.py — Unit Tests: Isolated RBAC Logic & Permissions
=================================================================

Covers five isolated layers:
  1. decode_auth0_jwt() — JWT validation & role extraction (mocked JWKS)
  2. Auth0Middleware — FastAPI middleware dispatch (no network)
  3. _rule_based_intent() — deterministic intent classification (~30 parametric cases)
  4. Supervisor ROLE_AGENT_ACCESS — exact contract assertions
  5. Billing / Payroll / Knowledge endpoint role checks via TestClient

All external dependencies (Auth0 JWKS, DB, LLM, Stripe) are mocked.
Run with: .venv/bin/python -m pytest tests/test_rbac_unit.py -v
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from main import app  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jwt_payload(
    sub="auth0|test-user",
    role="doctor",
    exp=9999999999,
    audience="http://localhost:8000",
    issuer="https://dev-test.us.auth0.com/",
):
    return {
        "sub": sub,
        "https://medisync.app/role": role,
        "aud": audience,
        "iss": issuer,
        "exp": exp,
        "iat": 1700000000,
    }


# ===========================================================================
# 1. decode_auth0_jwt() — JWT validation & role extraction
# ===========================================================================

class TestDecodeAuth0JWT(unittest.TestCase):
    """Tests for context.auth.decode_auth0_jwt — JWKS mocked, no network."""

    def _call(self, token_payload, **overrides):
        from context import auth as auth_mod
        fake_jwks = {"keys": []}
        with (
            patch.object(auth_mod, "_jwks_cache", fake_jwks),
            patch("jose.jwt.decode", return_value={**token_payload, **overrides}),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            return decode_auth0_jwt("fake.token.value")

    # --- Positive cases ---

    def test_doctor_role_extracted(self):
        uid, role = self._call(_make_jwt_payload(role="doctor"))
        self.assertEqual(uid, "auth0|test-user")
        self.assertEqual(role, "doctor")

    def test_nurse_role_extracted(self):
        uid, role = self._call(_make_jwt_payload(sub="auth0|nurse-1", role="nurse"))
        self.assertEqual(uid, "auth0|nurse-1")
        self.assertEqual(role, "nurse")

    def test_admin_role_extracted(self):
        _, role = self._call(_make_jwt_payload(sub="auth0|admin-1", role="admin"))
        self.assertEqual(role, "admin")

    def test_staff_role_defaults_to_doctor(self):
        _, role = self._call(_make_jwt_payload(role="staff"))
        self.assertEqual(role, "doctor")

    def test_empty_role_defaults_to_doctor(self):
        _, role = self._call(_make_jwt_payload(role=""))
        self.assertEqual(role, "doctor")

    def test_legacy_top_level_role_claim_fallback(self):
        """'role' top-level key used when namespace claim is absent."""
        from context import auth as auth_mod
        payload = {
            "sub": "auth0|legacy-user",
            "role": "nurse",
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
            _, role = decode_auth0_jwt("fake.token.value")
        self.assertEqual(role, "nurse")

    # --- Negative cases ---

    def test_unknown_role_raises_value_error(self):
        from context import auth as auth_mod
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", return_value=_make_jwt_payload(role="superadmin")),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError) as ctx:
                decode_auth0_jwt("fake.token.value")
        self.assertIn("superadmin", str(ctx.exception))

    def test_missing_sub_raises_value_error(self):
        from context import auth as auth_mod
        payload = _make_jwt_payload()
        payload.pop("sub")
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", return_value=payload),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError) as ctx:
                decode_auth0_jwt("fake.token.value")
        self.assertIn("sub", str(ctx.exception))

    def test_expired_token_raises_value_error(self):
        from context import auth as auth_mod
        from jose import JWTError
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", side_effect=JWTError("Signature has expired")),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError) as ctx:
                decode_auth0_jwt("fake.token.value")
        self.assertIn("JWT validation failed", str(ctx.exception))

    def test_malformed_jwt_raises_value_error(self):
        from context import auth as auth_mod
        from jose import JWTError
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", side_effect=JWTError("Not enough segments")),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError):
                decode_auth0_jwt("bad.token")

    def test_auth0_domain_not_set_raises_value_error(self):
        from context import auth as auth_mod
        with (
            patch.object(auth_mod, "_jwks_cache", None),
            patch.object(auth_mod.settings, "auth0_domain", ""),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError) as ctx:
                decode_auth0_jwt("any.token.value")
        self.assertIn("AUTH0_DOMAIN", str(ctx.exception))

    def test_wrong_signature_raises_value_error(self):
        from context import auth as auth_mod
        from jose import JWTError
        with (
            patch.object(auth_mod, "_jwks_cache", {"keys": []}),
            patch("jose.jwt.decode", side_effect=JWTError("Signature verification failed")),
            patch.object(auth_mod.settings, "auth0_domain", "dev-test.us.auth0.com"),
            patch.object(auth_mod.settings, "auth0_audience", "http://localhost:8000"),
        ):
            from context.auth import decode_auth0_jwt
            with self.assertRaises(ValueError):
                decode_auth0_jwt("tampered.token.here")


# ===========================================================================
# 2. Auth0Middleware — FastAPI middleware dispatch
# ===========================================================================

class TestAuth0Middleware(unittest.TestCase):
    @property
    def client(self):
        return TestClient(app, raise_server_exceptions=False)

    def test_missing_authorization_header_returns_401(self):
        res = self.client.get("/sessions")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authorization", res.json().get("error", ""))

    def test_non_bearer_prefix_returns_401(self):
        res = self.client.get("/sessions", headers={"Authorization": "Token abc123"})
        self.assertEqual(res.status_code, 401)

    def test_bearer_empty_token_returns_401(self):
        with patch(
            "context.auth.decode_auth0_jwt",
            side_effect=ValueError("JWT validation failed: Not enough segments"),
        ):
            res = self.client.get("/sessions", headers={"Authorization": "Bearer "})
        self.assertEqual(res.status_code, 401)

    def test_valid_token_passes_through_middleware(self):
        with patch(
            "context.auth.decode_auth0_jwt",
            return_value=("auth0|doc-1", "doctor"),
        ), patch("db.chat_history.list_sessions", return_value=[]):
            res = self.client.get(
                "/sessions", headers={"Authorization": "Bearer valid.token.here"}
            )
        # Middleware let it through (200 or 401 from handler for missing user_id is fine)
        self.assertNotEqual(res.status_code, 401)

    def test_health_endpoint_skips_auth(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)

    def test_root_endpoint_skips_auth(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("service"), "MediSync AI API")

    def test_options_request_skips_auth(self):
        res = self.client.options(
            "/chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertNotEqual(res.status_code, 401)

    def test_invalid_jwt_signature_returns_401(self):
        with patch(
            "context.auth.decode_auth0_jwt",
            side_effect=ValueError("JWT validation failed: Signature verification failed"),
        ):
            res = self.client.get(
                "/sessions", headers={"Authorization": "Bearer tampered.jwt.token"}
            )
        self.assertEqual(res.status_code, 401)
        self.assertIn("JWT validation failed", res.json().get("error", ""))


# ===========================================================================
# 3. _rule_based_intent() — parametric intent classification tests
# ===========================================================================

INTENT_PARAMS = [
    # patient_management — must use keywords that match the regex rules
    ("Add a new patient John Doe", "patient_management"),
    ("New admission required for patient", "patient_management"),
    ("Register a new patient", "patient_management"),
    ("Update treatment plan for patient", "patient_management"),
    ("Patients today overview", "patient_management"),
    # preference / memory → patient_management (NOT inventory)
    ("My preferred ward is East Wing", "patient_management"),
    ("What is my preferred ward?", "patient_management"),
    ("Do you remember my usual ward?", "patient_management"),
    ("What was my preference?", "patient_management"),
    # medical_diagnostics
    ("Analyze the chest X-ray", "medical_diagnostics"),
    ("Review diagnostic findings from MRI", "medical_diagnostics"),
    ("Lab result interpretation for blood panel", "medical_diagnostics"),
    ("CT scan differential diagnosis", "medical_diagnostics"),
    ("Pathology report summary", "medical_diagnostics"),
    # inventory_resource
    ("How many free beds are available in ICU", "inventory_resource"),
    ("Check low stock inventory items", "inventory_resource"),
    ("Allocate a bed in Ward B", "inventory_resource"),
    ("Theatre booking for OR-3 tomorrow", "inventory_resource"),
    ("Check inventory alert for expired supplies", "inventory_resource"),
    ("Items need reorder in pharmacy", "inventory_resource"),
    # staff_management
    ("Generate payroll for nursing staff", "staff_management"),
    ("Who is on night shift duty", "staff_management"),
    ("Check staff shift attendance this week", "staff_management"),
    ("Show shift gap coverage", "staff_management"),
    ("Process salary for all employees", "staff_management"),
    ("HR human resources query", "staff_management"),
    # appointment_scheduling
    ("Schedule an appointment for next Monday", "appointment_scheduling"),
    ("Check appointment conflicts for Dr Lee", "appointment_scheduling"),
    ("Create an invoice for patient billing", "appointment_scheduling"),
    ("Outstanding billing for patient PT-200", "appointment_scheduling"),
    ("Call the next patient in the queue", "appointment_scheduling"),
]


class TestRuleBasedIntent(unittest.TestCase):

    def _check(self, query, expected):
        from graph.supervisor import _rule_based_intent
        result = _rule_based_intent(query)
        self.assertEqual(
            result,
            expected,
            f"Query: {query!r}\n  Expected: {expected!r}\n  Got:      {result!r}",
        )

    def test_empty_string_returns_none(self):
        from graph.supervisor import _rule_based_intent
        self.assertIsNone(_rule_based_intent(""))

    def test_whitespace_only_returns_none(self):
        from graph.supervisor import _rule_based_intent
        self.assertIsNone(_rule_based_intent("   "))


def _add_intent_tests():
    for i, (query, expected) in enumerate(INTENT_PARAMS):
        safe_name = query[:35].replace(" ", "_").replace("?", "").replace("-", "_")
        method_name = f"test_{i:03d}_{expected}__{safe_name}"

        def make_test(q, ex):
            def test_fn(self):
                self._check(q, ex)
            test_fn.__name__ = make_test.__name__
            return test_fn

        setattr(TestRuleBasedIntent, method_name, make_test(query, expected))


_add_intent_tests()


# ===========================================================================
# 4. Supervisor ROLE_AGENT_ACCESS — exact contract
# ===========================================================================

class TestRoleAgentAccessContract(unittest.TestCase):

    def _access(self, role):
        from graph.supervisor import ROLE_AGENT_ACCESS
        return ROLE_AGENT_ACCESS.get(role, set())

    def test_doctor_access_exact(self):
        self.assertEqual(self._access("doctor"), {"patient_management", "medical_diagnostics"})

    def test_nurse_access_exact(self):
        self.assertEqual(
            self._access("nurse"),
            {"patient_management", "medical_diagnostics", "inventory_resource"},
        )

    def test_admin_access_exact(self):
        self.assertEqual(
            self._access("admin"),
            {
                "patient_management",
                "medical_diagnostics",
                "appointment_scheduling",
                "inventory_resource",
                "staff_management",
            },
        )

    def test_unknown_role_returns_empty_set(self):
        self.assertEqual(self._access("hacker"), set())

    def test_empty_role_returns_empty_set(self):
        self.assertEqual(self._access(""), set())

    def test_admin_is_superset_of_nurse(self):
        from graph.supervisor import ROLE_AGENT_ACCESS
        self.assertTrue(ROLE_AGENT_ACCESS["nurse"].issubset(ROLE_AGENT_ACCESS["admin"]))

    def test_nurse_is_superset_of_doctor(self):
        from graph.supervisor import ROLE_AGENT_ACCESS
        self.assertTrue(ROLE_AGENT_ACCESS["doctor"].issubset(ROLE_AGENT_ACCESS["nurse"]))

    def test_doctor_cannot_access_staff_management(self):
        self.assertNotIn("staff_management", self._access("doctor"))

    def test_nurse_cannot_access_staff_management(self):
        self.assertNotIn("staff_management", self._access("nurse"))

    def test_nurse_cannot_access_appointment_scheduling(self):
        self.assertNotIn("appointment_scheduling", self._access("nurse"))

    def test_doctor_cannot_access_inventory_resource(self):
        self.assertNotIn("inventory_resource", self._access("doctor"))

    def test_admin_access_count_is_five(self):
        self.assertEqual(len(self._access("admin")), 5)


# ===========================================================================
# 5. Billing endpoint role checks
# ===========================================================================

class TestBillingRoleGating(unittest.TestCase):
    @property
    def client(self):
        return TestClient(app, raise_server_exceptions=False)

    def _mock_jwt(self, role):
        return patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}", role))

    def test_unauth_billing_list_401(self):
        self.assertEqual(self.client.get("/billing/invoices").status_code, 401)

    def test_doctor_billing_list_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.get("/billing/invoices", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)
        self.assertIn("cannot access billing", res.json().get("error", ""))

    def test_doctor_billing_create_403(self):
        body = {"patient_id": "pid-001", "line_items": []}
        with self._mock_jwt("doctor"):
            res = self.client.post("/billing/invoices", json=body, headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_doctor_billing_update_status_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.patch(
                "/billing/invoices/some-id/status",
                json={"status": "paid"},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_doctor_billing_summary_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.get("/billing/summary", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_nurse_billing_list_not_403(self):
        with self._mock_jwt("nurse"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=json.dumps({"outstanding_amount": 0, "paid_this_month": 0, "total_invoices": 0}))
            res = self.client.get("/billing/summary", headers={"Authorization": "Bearer tok"})
        self.assertNotEqual(res.status_code, 403)

    def test_admin_billing_summary_not_403(self):
        with self._mock_jwt("admin"), \
             patch("tools.billing_data.get_invoice_summary") as m:
            m.invoke = MagicMock(return_value=json.dumps({"outstanding_amount": 0, "paid_this_month": 0, "total_invoices": 0}))
            res = self.client.get("/billing/summary", headers={"Authorization": "Bearer tok"})
        self.assertNotEqual(res.status_code, 403)

    def test_unauth_billing_create_401(self):
        body = {"patient_id": "pid-001", "line_items": []}
        self.assertEqual(self.client.post("/billing/invoices", json=body).status_code, 401)

    def test_unauth_billing_update_status_401(self):
        self.assertEqual(
            self.client.patch("/billing/invoices/x/status", json={"status": "paid"}).status_code,
            401,
        )


# ===========================================================================
# 6. Payroll endpoint role checks
# ===========================================================================

class TestPayrollRoleGating(unittest.TestCase):
    @property
    def client(self):
        return TestClient(app, raise_server_exceptions=False)

    def _mock_jwt(self, role):
        return patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}", role))

    def test_unauth_payroll_process_401(self):
        res = self.client.post("/payroll/process", json={"payroll_id": "test-id"})
        self.assertEqual(res.status_code, 401)

    def test_doctor_payroll_process_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.post(
                "/payroll/process",
                json={"payroll_id": "test-id"},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)
        self.assertIn("admin", res.json().get("error", "").lower())

    def test_nurse_payroll_process_403(self):
        with self._mock_jwt("nurse"):
            res = self.client.post(
                "/payroll/process",
                json={"payroll_id": "test-id"},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_admin_payroll_no_stripe_503(self):
        with self._mock_jwt("admin"), \
             patch("tools.stripe_payroll.stripe_configured", return_value=False):
            res = self.client.post(
                "/payroll/process",
                json={"payroll_id": "test-id"},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json().get("status"), "skipped")

    def test_payroll_status_all_roles_200(self):
        for role in ("doctor", "nurse", "admin"):
            with self.subTest(role=role), \
                 patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}", role)):
                res = self.client.get("/payroll/status", headers={"Authorization": "Bearer tok"})
            self.assertEqual(res.status_code, 200, f"Role {role} should access /payroll/status")


# ===========================================================================
# 7. Knowledge endpoint role checks
# ===========================================================================

class TestKnowledgeRoleGating(unittest.TestCase):
    @property
    def client(self):
        return TestClient(app, raise_server_exceptions=False)

    def _mock_jwt(self, role):
        return patch("context.auth.decode_auth0_jwt", return_value=(f"auth0|{role}", role))

    def test_unauth_knowledge_status_401(self):
        self.assertEqual(self.client.get("/knowledge/status").status_code, 401)

    def test_doctor_knowledge_status_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.get("/knowledge/status", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_nurse_knowledge_status_403(self):
        with self._mock_jwt("nurse"):
            res = self.client.get("/knowledge/status", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_doctor_knowledge_upload_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.post(
                "/knowledge/upload",
                files={"file": ("test.txt", b"content", "text/plain")},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_nurse_knowledge_upload_403(self):
        with self._mock_jwt("nurse"):
            res = self.client.post(
                "/knowledge/upload",
                files={"file": ("test.txt", b"content", "text/plain")},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_doctor_knowledge_reindex_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.post("/knowledge/reindex", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_nurse_knowledge_reindex_403(self):
        with self._mock_jwt("nurse"):
            res = self.client.post("/knowledge/reindex", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 403)

    def test_doctor_knowledge_delete_403(self):
        with self._mock_jwt("doctor"):
            res = self.client.delete(
                "/knowledge/document/some-upload-id",
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_nurse_knowledge_delete_403(self):
        with self._mock_jwt("nurse"):
            res = self.client.delete(
                "/knowledge/document/some-upload-id",
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403)

    def test_admin_knowledge_status_not_403(self):
        with self._mock_jwt("admin"):
            res = self.client.get("/knowledge/status", headers={"Authorization": "Bearer tok"})
        # Admin is allowed (may fail due to Chroma not running, but NOT a 403)
        self.assertNotEqual(res.status_code, 403)


# ===========================================================================
# 8. Supervisor: unknown role, autonomous deny, hard-deny no remap
# ===========================================================================

class TestSupervisorRoleDeny(unittest.TestCase):

    def test_unknown_role_hard_denied(self):
        from langchain_core.messages import HumanMessage
        from graph.supervisor import supervisor_node
        state = {
            "messages": [HumanMessage(content="Hello")],
            "user_role": "hacker",
            "user_id": "auth0|hacker-1",
            "session_id": "00000000-0000-0000-0000-000000000010",
            "entry_mode": "chat",
            "context": {},
        }
        cmd = supervisor_node(state)
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("not recognised", str(cmd.update["messages"][-1].content))

    def test_autonomous_mode_doctor_denied_staff(self):
        from graph.supervisor import supervisor_node
        state = {
            "messages": [],
            "user_role": "doctor",
            "user_id": "auth0|doctor-auto",
            "session_id": "00000000-0000-0000-0000-000000000011",
            "entry_mode": "autonomous",
            "active_agent": "staff_management",
            "context": {},
        }
        cmd = supervisor_node(state)
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("denied", str(cmd.update["messages"][-1].content).lower())
        self.assertNotEqual(cmd.update.get("active_agent"), "staff_management")

    def test_autonomous_mode_admin_allowed_staff(self):
        from graph.supervisor import supervisor_node
        state = {
            "messages": [],
            "user_role": "admin",
            "user_id": "auth0|admin-auto",
            "session_id": "00000000-0000-0000-0000-000000000012",
            "entry_mode": "autonomous",
            "active_agent": "staff_management",
            "context": {},
        }
        cmd = supervisor_node(state)
        self.assertEqual(cmd.goto, "staff_management")
        self.assertEqual(cmd.update.get("active_agent"), "staff_management")

    def _chat_run(self, role, classified_agent):
        from langchain_core.messages import HumanMessage
        from graph.supervisor import supervisor_node
        state = {
            "messages": [HumanMessage(content="Payroll for nursing staff")],
            "user_role": role,
            "user_id": f"auth0|{role}-chat",
            "session_id": "00000000-0000-0000-0000-000000000020",
            "entry_mode": "chat",
            "context": {},
        }
        with patch("graph.supervisor._classify_intent", return_value=classified_agent):
            return supervisor_node(state)

    def test_doctor_denied_staff_management_no_remap(self):
        cmd = self._chat_run("doctor", "staff_management")
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("Access denied", str(cmd.update["messages"][-1].content))

    def test_doctor_denied_appointment_scheduling_no_remap(self):
        cmd = self._chat_run("doctor", "appointment_scheduling")
        self.assertEqual(cmd.goto, "__end__")
        self.assertNotEqual(cmd.update.get("active_agent"), "appointment_scheduling")

    def test_nurse_denied_staff_management_no_remap(self):
        cmd = self._chat_run("nurse", "staff_management")
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("Access denied", str(cmd.update["messages"][-1].content))

    def test_admin_allowed_staff_management_routed(self):
        cmd = self._chat_run("admin", "staff_management")
        self.assertEqual(cmd.goto, "staff_management")

    def test_doctor_allowed_patient_management_routed(self):
        cmd = self._chat_run("doctor", "patient_management")
        self.assertEqual(cmd.goto, "patient_management")

    def test_nurse_allowed_inventory_resource_routed(self):
        cmd = self._chat_run("nurse", "inventory_resource")
        self.assertEqual(cmd.goto, "inventory_resource")

    def test_nurse_denied_appointment_scheduling_no_remap(self):
        cmd = self._chat_run("nurse", "appointment_scheduling")
        self.assertEqual(cmd.goto, "__end__")


if __name__ == "__main__":
    raise SystemExit(unittest.main())
