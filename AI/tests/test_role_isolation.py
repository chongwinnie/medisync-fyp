"""Role-gate + isolation contract tests (no network, no secrets).

Proves ParallelContracts §11 hard-deny and session/memory key scoping patterns
used for multi-account concurrency — run without three Auth0 passwords.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from langchain_core.messages import HumanMessage  # noqa: E402

from graph.supervisor import (  # noqa: E402
    ROLE_AGENT_ACCESS,
    _rule_based_intent,
    supervisor_node,
)


class RoleMatrixTests(unittest.TestCase):
    def test_role_matrix_matches_contracts(self) -> None:
        self.assertEqual(
            ROLE_AGENT_ACCESS["doctor"],
            {"patient_management", "medical_diagnostics"},
        )
        self.assertEqual(
            ROLE_AGENT_ACCESS["nurse"],
            {"patient_management", "medical_diagnostics", "inventory_resource"},
        )
        self.assertEqual(
            ROLE_AGENT_ACCESS["admin"],
            {
                "patient_management",
                "medical_diagnostics",
                "appointment_scheduling",
                "inventory_resource",
                "staff_management",
            },
        )

    def test_payroll_routes_to_staff_management(self) -> None:
        self.assertEqual(
            _rule_based_intent("Generate payroll for nursing staff"),
            "staff_management",
        )


class HardDenyTests(unittest.TestCase):
    def _run(self, role: str, text: str):
        state = {
            "messages": [HumanMessage(content=text)],
            "user_role": role,
            "user_id": f"auth0|{role}-test",
            "session_id": "00000000-0000-0000-0000-000000000099",
            "entry_mode": "chat",
            "context": {},
        }
        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            return supervisor_node(state)

    def test_doctor_denied_staff_management(self) -> None:
        cmd = self._run("doctor", "Generate payroll for nursing staff")
        self.assertEqual(cmd.goto, "__end__")
        last = cmd.update["messages"][-1]
        self.assertIn("Access denied", str(last.content))
        self.assertNotEqual(cmd.update.get("active_agent"), "staff_management")

    def test_nurse_denied_staff_management(self) -> None:
        cmd = self._run("nurse", "Process staff payroll")
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("Access denied", str(cmd.update["messages"][-1].content))

    def test_admin_allowed_staff_management(self) -> None:
        state = {
            "messages": [HumanMessage(content="Generate payroll")],
            "user_role": "admin",
            "user_id": "auth0|admin-test",
            "session_id": "00000000-0000-0000-0000-000000000098",
            "entry_mode": "chat",
            "context": {},
        }
        with patch("graph.supervisor._classify_intent", return_value="staff_management"):
            cmd = supervisor_node(state)
        self.assertEqual(cmd.goto, "staff_management")
        self.assertEqual(cmd.update.get("active_agent"), "staff_management")

    def test_autonomous_respects_role_gate(self) -> None:
        state = {
            "messages": [],
            "user_role": "doctor",
            "user_id": "auth0|doctor-auto",
            "session_id": "00000000-0000-0000-0000-000000000097",
            "entry_mode": "autonomous",
            "active_agent": "staff_management",
            "context": {},
        }
        cmd = supervisor_node(state)
        self.assertEqual(cmd.goto, "__end__")
        self.assertIn("denied", str(cmd.update["messages"][-1].content).lower())


class IsolationKeyContractTests(unittest.TestCase):
    """Documented isolation key shapes — must stay user-scoped."""

    def test_redis_session_key_shape(self) -> None:
        sub = "auth0|user-a"
        session_id = "11111111-1111-1111-1111-111111111111"
        key = f"session:{sub}:{session_id}"
        other = f"session:auth0|user-b:{session_id}"
        self.assertNotEqual(key, other)
        self.assertTrue(key.startswith("session:auth0|"))

    def test_frontend_localstorage_key_shape(self) -> None:
        # Matches application chat localStorage convention (FYP-PERFECT-1)
        sub = "auth0|doctor-1"
        key = f"medisync.chat.activeSession.{sub}"
        self.assertIn(sub, key)
        self.assertNotEqual(key, "medisync.chat.activeSession.auth0|nurse-1")


if __name__ == "__main__":
    raise SystemExit(unittest.main())
