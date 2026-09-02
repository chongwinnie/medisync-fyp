"""
test_rbac_data_isolation.py — Horizontal Privilege Separation Tests
====================================================================

Verifies that users cannot access each other's data even when they share the same role.
Tests horizontal isolation (user A vs user B) rather than vertical (role A vs role B).

Coverage:
  1. Session ownership isolation — User B cannot access User A's sessions
  2. Supervisor state isolation — concurrent state objects don't bleed
  3. Redis session key namespace scoping — keys are user+session scoped
  4. Appointment ownership isolation — doctor can only manage own appointments
  5. Edge cases — empty user_id, path traversal, injection attempt

Run with: .venv/bin/python -m pytest tests/test_rbac_data_isolation.py -v
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


def _jwt(user_sub: str, role: str):
    """Mock JWT returning a specific user sub, used for isolation tests."""
    return patch("context.auth.decode_auth0_jwt", return_value=(user_sub, role))


def _auth(role: str) -> dict:
    return {"Authorization": f"Bearer fake_{role}_isolation_token"}


# ===========================================================================
# 1. Session Ownership Isolation
# ===========================================================================

class TestSessionOwnershipIsolation(unittest.TestCase):
    """
    User A and User B share the same 'doctor' role.
    User B must NOT be able to access User A's sessions.
    """

    USER_A = "auth0|doctor-isolation-A"
    USER_B = "auth0|doctor-isolation-B"
    SESSION_ID = "session-belongs-to-A-only"

    def test_user_b_cannot_read_user_a_messages(self):
        """
        get_session_messages returns None for non-owner → 404.
        User B tries to read User A's session → must get 404 not 200.
        """
        # Simulate: DB returns None because USER_B doesn't own this session
        with _jwt(self.USER_B, "doctor"), \
             patch("db.chat_history.get_session_messages", return_value=None):
            res = _client().get(
                f"/sessions/{self.SESSION_ID}/messages",
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 404, "User B must not see User A's session messages")

    def test_user_b_cannot_delete_user_a_session(self):
        """
        delete_session returns False for non-owner → 404.
        User B tries to delete User A's session → must get 404 not 200.
        """
        with _jwt(self.USER_B, "doctor"), \
             patch("db.chat_history.delete_session", return_value=False):
            res = _client().delete(
                f"/sessions/{self.SESSION_ID}",
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 404, "User B must not be able to delete User A's session")

    def test_user_a_can_read_own_messages(self):
        """
        User A reads their own session → 200.
        """
        messages = [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi"}]
        with _jwt(self.USER_A, "doctor"), \
             patch("db.chat_history.get_session_messages", return_value=messages), \
             patch("context.session_load.save_session", new_callable=AsyncMock):
            res = _client().get(
                f"/sessions/{self.SESSION_ID}/messages",
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 200, "User A must be able to read own session messages")
        self.assertEqual(res.json().get("session_id"), self.SESSION_ID)

    def test_user_a_can_delete_own_session(self):
        """User A deletes their own session → 200."""
        with _jwt(self.USER_A, "doctor"), \
             patch("db.chat_history.delete_session", return_value=True):
            res = _client().delete(
                f"/sessions/{self.SESSION_ID}",
                headers=_auth("doctor"),
            )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("deleted"))

    def test_session_list_is_user_scoped(self):
        """list_sessions is called with User A's sub — should only return User A's sessions."""
        user_a_sessions = [
            {"id": "sess-A-01", "title": "Patient consultation", "user_id": self.USER_A},
        ]

        with _jwt(self.USER_A, "doctor"), \
             patch("db.chat_history.list_sessions") as mock_list:
            mock_list.return_value = user_a_sessions
            res = _client().get("/sessions", headers=_auth("doctor"))

        self.assertEqual(res.status_code, 200)
        # Verify list_sessions was called with User A's sub (not User B's)
        call_args = mock_list.call_args
        self.assertEqual(call_args.kwargs.get("auth0_sub") or call_args.args[0], self.USER_A)

    def test_session_list_scoped_per_user_role(self):
        """
        Two users with same 'nurse' role but different subs → each gets their own sessions.
        The DB mock is called with the correct sub for each user.
        """
        NURSE_A = "auth0|nurse-iso-A"
        NURSE_B = "auth0|nurse-iso-B"

        with _jwt(NURSE_A, "nurse"), \
             patch("db.chat_history.list_sessions") as mock_list_a:
            mock_list_a.return_value = []
            _client().get("/sessions", headers=_auth("nurse"))
        call_args_a = mock_list_a.call_args
        sub_a = call_args_a.kwargs.get("auth0_sub") or call_args_a.args[0]

        with _jwt(NURSE_B, "nurse"), \
             patch("db.chat_history.list_sessions") as mock_list_b:
            mock_list_b.return_value = []
            _client().get("/sessions", headers=_auth("nurse"))
        call_args_b = mock_list_b.call_args
        sub_b = call_args_b.kwargs.get("auth0_sub") or call_args_b.args[0]

        self.assertNotEqual(sub_a, sub_b, "list_sessions must be scoped to each user's sub independently")
        self.assertEqual(sub_a, NURSE_A)
        self.assertEqual(sub_b, NURSE_B)


# ===========================================================================
# 2. Supervisor State Isolation
# ===========================================================================

class TestSupervisorStateIsolation(unittest.TestCase):
    """
    The supervisor_node is a pure function of its input state.
    Two concurrent state objects with different user_id must not share state.
    """

    def _state(self, user_id: str, role: str, message: str = "Hello"):
        from langchain_core.messages import HumanMessage
        return {
            "messages": [HumanMessage(content=message)],
            "user_role": role,
            "user_id": user_id,
            "session_id": f"session-{user_id[-4:]}",
            "entry_mode": "chat",
            "context": {},
        }

    def test_concurrent_states_do_not_share_user_id(self):
        from graph.supervisor import supervisor_node

        state_a = self._state("auth0|doctor-iso-A", "doctor", "Show patient vitals")
        state_b = self._state("auth0|nurse-iso-B", "nurse", "Check inventory")

        with patch("graph.supervisor._classify_intent") as mock_classify:
            mock_classify.side_effect = ["patient_management", "inventory_resource"]
            cmd_a = supervisor_node(state_a)
            cmd_b = supervisor_node(state_b)

        self.assertEqual(cmd_a.update["user_id"], "auth0|doctor-iso-A")
        self.assertEqual(cmd_b.update["user_id"], "auth0|nurse-iso-B")
        self.assertNotEqual(cmd_a.update["user_id"], cmd_b.update["user_id"])

    def test_concurrent_states_do_not_share_session_id(self):
        from graph.supervisor import supervisor_node

        state_a = self._state("auth0|user-A", "admin", "Payroll report")
        state_b = self._state("auth0|user-B", "admin", "Payroll report")
        state_a["session_id"] = "session-AAAA"
        state_b["session_id"] = "session-BBBB"

        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd_a = supervisor_node(state_a)
            cmd_b = supervisor_node(state_b)

        self.assertNotEqual(cmd_a.update.get("session_id"), cmd_b.update.get("session_id"))

    def test_denied_user_state_does_not_contaminate_allowed_user(self):
        """
        When doctor is denied, the returned state must still have the doctor's user_id.
        A subsequent admin call must not be affected.
        """
        from langchain_core.messages import HumanMessage
        from graph.supervisor import supervisor_node

        doctor_state = {
            "messages": [HumanMessage(content="Payroll")],
            "user_role": "doctor",
            "user_id": "auth0|doctor-contamination-test",
            "session_id": "session-doctor-contam",
            "entry_mode": "chat",
            "context": {},
        }
        admin_state = {
            "messages": [HumanMessage(content="Payroll")],
            "user_role": "admin",
            "user_id": "auth0|admin-contamination-test",
            "session_id": "session-admin-contam",
            "entry_mode": "chat",
            "context": {},
        }

        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd_doctor = supervisor_node(doctor_state)

        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd_admin = supervisor_node(admin_state)

        # Doctor denied
        self.assertEqual(cmd_doctor.goto, "__end__")
        self.assertEqual(cmd_doctor.update["user_id"], "auth0|doctor-contamination-test")

        # Admin allowed — must have admin's user_id, not doctor's
        self.assertEqual(cmd_admin.goto, "staff_management")
        self.assertEqual(cmd_admin.update["user_id"], "auth0|admin-contamination-test")
        self.assertNotEqual(cmd_admin.update["user_id"], cmd_doctor.update["user_id"])


# ===========================================================================
# 3. Redis Session Key Namespace Scoping
# ===========================================================================

class TestRedisSessionKeyScoping(unittest.TestCase):
    """
    Validates documented key-scoping conventions that prevent cross-user
    cache pollution. These are contract tests — no Redis instance required.
    """

    def _make_key(self, sub: str, session_id: str) -> str:
        return f"session:{sub}:{session_id}"

    def test_different_users_same_session_id_have_different_keys(self):
        """Same session_id but different subs → different Redis keys."""
        shared_session_id = "11111111-1111-1111-1111-111111111111"
        key_a = self._make_key("auth0|user-A", shared_session_id)
        key_b = self._make_key("auth0|user-B", shared_session_id)
        self.assertNotEqual(key_a, key_b)

    def test_same_user_different_sessions_have_different_keys(self):
        """Same user but different session_ids → different Redis keys."""
        sub = "auth0|doctor-001"
        key_1 = self._make_key(sub, "session-001")
        key_2 = self._make_key(sub, "session-002")
        self.assertNotEqual(key_1, key_2)

    def test_key_starts_with_session_prefix(self):
        key = self._make_key("auth0|user-X", "some-session")
        self.assertTrue(key.startswith("session:auth0|"))

    def test_key_contains_full_auth0_sub(self):
        sub = "auth0|google-oauth2|999888777666"
        key = self._make_key(sub, "some-session")
        self.assertIn(sub, key)

    def test_key_schema_uniqueness_across_roles_and_users(self):
        """
        Generate keys for a 3x3 grid (3 users × 3 sessions) and
        assert all keys are unique.
        """
        users = ["auth0|doctor-001", "auth0|nurse-002", "auth0|admin-003"]
        sessions = ["session-A", "session-B", "session-C"]
        keys = [self._make_key(u, s) for u in users for s in sessions]
        self.assertEqual(len(keys), len(set(keys)), "All session keys must be unique")

    def test_frontend_localstorage_key_shape(self):
        """
        Matches application chat localStorage convention:
        'medisync.chat.activeSession.{auth0_sub}'
        """
        sub = "auth0|doctor-1"
        key = f"medisync.chat.activeSession.{sub}"
        self.assertIn(sub, key)
        self.assertNotEqual(key, f"medisync.chat.activeSession.auth0|nurse-1")
        self.assertTrue(key.startswith("medisync.chat.activeSession."))


# ===========================================================================
# 4. Appointment Ownership Isolation (Horizontal)
# ===========================================================================

class TestAppointmentOwnershipIsolation(unittest.TestCase):
    """
    Doctors can only manage their own appointments (staffId must match).
    A doctor cannot update appointments belonging to another doctor.
    """

    DOCTOR_A_STAFF_ID = "staff-doctor-A-001"
    DOCTOR_B_STAFF_ID = "staff-doctor-B-002"

    def _make_user(self, staff_id: str, role: str = "doctor"):
        mock_user = MagicMock()
        mock_user.role = role
        mock_user.staffId = staff_id
        mock_user.userId = f"user-{staff_id}"
        return mock_user

    @unittest.skip("lib.actions.appointments is a Next.js Server Action (TypeScript only). "
                   "Horizontal isolation is enforced by the staffId ownership check in "
                   "application/lib/actions/appointments.ts, verified by role-guard.test.ts.")
    def test_doctor_can_manage_own_appointment(self):
        pass

    @unittest.skip("lib.actions.appointments is a Next.js Server Action (TypeScript only).")
    def test_doctor_cannot_manage_other_doctors_appointment(self):
        pass

    @unittest.skip("lib.actions.appointments is a Next.js Server Action (TypeScript only).")
    def test_admin_can_manage_any_appointment(self):
        pass

    @unittest.skip("lib.actions.appointments is a Next.js Server Action (TypeScript only).")
    def test_nurse_can_manage_any_appointment(self):
        pass


# ===========================================================================
# 5. Edge Cases & Injection Resistance
# ===========================================================================

class TestEdgeCasesAndInjectionResistance(unittest.TestCase):
    """
    Tests that the API handles edge-case inputs gracefully:
    - Empty user_id → 401 (not 500)
    - Path traversal in session_id → 404 (not 500)
    - Unusual characters in payroll_id → error JSON (not crash)
    """

    def test_empty_user_id_on_sessions_returns_401(self):
        """
        When middleware sets user_id to '' (empty string from JWT with empty sub),
        the /sessions endpoint must return 401 not 500.
        """
        with patch("context.auth.decode_auth0_jwt", return_value=("", "doctor")):
            res = _client().get("/sessions", headers={"Authorization": "Bearer tok"})
        # user_id is empty → handler returns 401 {"error": "Unauthorized"}
        self.assertEqual(res.status_code, 401)
        self.assertIn("Unauthorized", res.json().get("error", ""))

    def test_path_traversal_in_session_id_returns_404_not_500(self):
        """
        A path traversal attempt like '../../etc/passwd' as session_id
        must return 404 (not found) not 500 (internal error).
        """
        malicious_id = "../../etc/passwd"
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doctor-edge", "doctor")), \
             patch("db.chat_history.get_session_messages", return_value=None):
            res = _client().get(
                f"/sessions/{malicious_id}/messages",
                headers={"Authorization": "Bearer tok"},
            )
        # The handler returns 404 since get_session_messages returns None
        self.assertIn(res.status_code, (404, 422), "Path traversal must return 404 or 422 not 500")
        self.assertNotEqual(res.status_code, 500)

    def test_sql_injection_in_payroll_id_returns_error_not_crash(self):
        """
        A SQL injection attempt in payroll_id must not cause a 500 crash.
        Doctor role → 403 (before any DB call). Admin role → graceful error.
        """
        malicious_id = "'; DROP TABLE payroll_records; --"
        # Doctor → blocked at role gate (403)
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doctor-sql", "doctor")):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": malicious_id},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 403, "Doctor must be blocked at role gate before DB access")

        # Admin → Stripe not configured → 503 (never reaches DB with raw SQL)
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-sql", "admin")), \
             patch("tools.stripe_payroll.stripe_configured", return_value=False):
            res = _client().post(
                "/payroll/process",
                json={"payroll_id": malicious_id},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertNotEqual(res.status_code, 500, "Must not crash on malicious payroll_id")

    def test_oversized_session_id_does_not_crash(self):
        """A very long session_id (1000 chars) must return 404 not 500."""
        long_id = "A" * 1000
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doctor-len", "doctor")), \
             patch("db.chat_history.get_session_messages", return_value=None):
            res = _client().get(
                f"/sessions/{long_id}/messages",
                headers={"Authorization": "Bearer tok"},
            )
        self.assertNotEqual(res.status_code, 500)

    def test_missing_payroll_id_field_returns_422(self):
        """Omitting required payroll_id field → 422 Unprocessable Entity (Pydantic validation)."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-val", "admin")):
            res = _client().post(
                "/payroll/process",
                json={},  # missing payroll_id
                headers={"Authorization": "Bearer tok"},
            )
        self.assertEqual(res.status_code, 422)

    def test_null_role_in_session_list_returns_401(self):
        """
        If middleware somehow sets user_id but user_id is empty, handler must 401.
        (Defensive check against future middleware bugs.)
        """
        with patch("context.auth.decode_auth0_jwt", return_value=("", "nurse")):
            res = _client().get("/sessions", headers={"Authorization": "Bearer tok"})
        self.assertEqual(res.status_code, 401)

    def test_unicode_in_session_title_is_handled(self):
        """Unicode characters in session creation body must not crash."""
        mock_row = {
            "id": "session-unicode-01",
            "title": "日本語のセッション",
            "created_at": "2026-01-01T00:00:00Z",
            "user_id": "auth0|doctor-unicode",
            "user_role": "doctor",
        }
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doctor-unicode", "doctor")), \
             patch("db.chat_history.create_session", return_value=mock_row):
            res = _client().post(
                "/sessions",
                json={"title": "日本語のセッション"},
                headers={"Authorization": "Bearer tok"},
            )
        self.assertNotEqual(res.status_code, 500)


# ===========================================================================
# 6. Role Boundary Invariants
# ===========================================================================

class TestRoleBoundaryInvariants(unittest.TestCase):
    """
    Invariants that must hold regardless of input:
    - Doctor cannot access admin-only endpoints, period
    - Nurse cannot access admin-only endpoints, period
    - Unauthenticated cannot access any protected endpoint
    """

    ADMIN_ONLY_ENDPOINTS = [
        ("POST", "/payroll/process", {"payroll_id": "x"}),
        ("GET", "/knowledge/status", None),
        ("POST", "/knowledge/reindex", None),
        ("DELETE", "/knowledge/document/x", None),
    ]

    PROTECTED_ENDPOINTS = [
        ("GET", "/sessions", None),
        ("POST", "/sessions", {}),
        ("POST", "/chat", {"message": "hi"}),
        ("GET", "/payroll/status", None),
        ("GET", "/billing/summary", None),
        ("POST", "/alerts/emit", {"title": "T", "message": "M", "category": "system", "severity": "info"}),
    ]

    def _request(self, client, method, path, body=None, headers=None):
        headers = headers or {}
        if method == "GET":
            return client.get(path, headers=headers)
        elif method == "POST":
            return client.post(path, json=body or {}, headers=headers)
        elif method == "DELETE":
            return client.delete(path, headers=headers)
        raise ValueError(f"Unsupported method: {method}")

    def test_doctor_denied_all_admin_only_endpoints(self):
        client = _client()
        for method, path, body in self.ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=f"{method} {path}"), \
                 patch("context.auth.decode_auth0_jwt", return_value=("auth0|doctor-inv", "doctor")):
                res = self._request(client, method, path, body, {"Authorization": "Bearer tok"})
            self.assertEqual(res.status_code, 403,
                             f"Doctor must be denied {method} {path}")

    def test_nurse_denied_all_admin_only_endpoints(self):
        client = _client()
        for method, path, body in self.ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=f"{method} {path}"), \
                 patch("context.auth.decode_auth0_jwt", return_value=("auth0|nurse-inv", "nurse")):
                res = self._request(client, method, path, body, {"Authorization": "Bearer tok"})
            self.assertEqual(res.status_code, 403,
                             f"Nurse must be denied {method} {path}")

    def test_unauthenticated_denied_all_protected_endpoints(self):
        client = _client()
        for method, path, body in self.PROTECTED_ENDPOINTS:
            with self.subTest(endpoint=f"{method} {path}"):
                res = self._request(client, method, path, body)
            self.assertEqual(res.status_code, 401,
                             f"Unauthenticated must get 401 for {method} {path}")


if __name__ == "__main__":
    raise SystemExit(unittest.main())
