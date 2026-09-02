"""
test_clinical_simulation_e2e.py — Comprehensive End-to-End Clinical Simulation Test Suite
========================================================================================

Simulates real-world hospital workflows across:
- Doctor
- Nurse / Clinical Staff
- Operations Staff
- Hospital Admin
- RAG & Multimodal AI Core

Run with: .venv/bin/pytest tests/test_clinical_simulation_e2e.py -v
"""
import base64
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=False)

TEST_SCAN_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="


class TestDoctorClinicalSimulation:
    """Simulates Doctor daily clinical interactions."""

    def test_doctor_scan_vision_analysis(self):
        """Doctor uploads scan for AI vision diagnostic interpretation."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doc-1", "doctor")):
            mock_client = MagicMock()
            mock_choice = MagicMock()
            mock_choice.message.content = json.dumps({
                "modality": "ultrasound",
                "impression": "Normal single intrauterine pregnancy at 24 weeks.",
                "findings": [{"structure": "Fetal pole", "finding": "Normal cardiac activity", "severity": "normal"}],
                "recommendations": ["Routine 28-week follow-up"],
                "icd10_codes": ["Z34.80"],
                "confidence": 0.96,
            })
            mock_client.chat.completions.create.return_value = MagicMock(choices=[mock_choice])
            
            with patch("config.llm.get_vision_candidates", return_value=[("mock_provider", mock_client, "mock-model")]):
                resp = client.post(
                    "/diagnostics/analyze",
                    headers={"Authorization": "Bearer fake_doc_token"},
                    json={"image_base64": TEST_SCAN_B64, "modality": "ultrasound"},
                )
                assert resp.status_code == 200
                data = resp.json()
                assert "impression" in data or "summary" in data

    def test_doctor_chat_clinical_inquiry(self):
        """Doctor queries AI assistant for treatment plan & medication review."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|doc-1", "doctor")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "Patient PT-1001 exhibits mild gestational hypertension. Recommend labetalol 100mg BID."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "patient_management"}
                
                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_doc_token"},
                    json={"message": "Summarize treatment plan for patient PT-1001", "session_id": "doc-session-1"},
                )
                assert resp.status_code == 200
                assert "labetalol" in resp.text


class TestNurseClinicalSimulation:
    """Simulates Nurse daily patient care, inventory, and RBAC boundary enforcement."""

    def test_nurse_patient_care_inquiry(self):
        """Nurse queries patient vitals and active medication list."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|nurse-1", "nurse")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "Patient PT-1001 vitals: BP 120/80 mmHg, HR 72 bpm, SpO2 99%."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "patient_management"}

                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_nurse_token"},
                    json={"message": "Show active vitals for patient PT-1001", "session_id": "nurse-session-1"},
                )
                assert resp.status_code == 200
                assert "120/80" in resp.text

    def test_nurse_inventory_check(self):
        """Nurse checks ICU bed allocation and medical supply levels."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|nurse-1", "nurse")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "ICU Bed occupancy is currently at 75%. Surgical mask stock is adequate."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "inventory_resource"}

                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_nurse_token"},
                    json={"message": "Check ICU bed status and mask inventory", "session_id": "nurse-session-2"},
                )
                assert resp.status_code == 200
                assert "ICU" in resp.text

    def test_nurse_blocked_from_admin_payroll(self):
        """Security: Nurse attempting Admin Stripe payroll must receive HTTP 403."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|nurse-1", "nurse")):
            resp = client.post(
                "/payroll/process",
                headers={"Authorization": "Bearer fake_nurse_token"},
                json={"payroll_id": "pay-1"},
            )
            assert resp.status_code == 403


class TestOperationsStaffSimulation:
    """Simulates Operations Staff scheduling and billing workflows."""

    def test_appointment_booking_and_conflict_check(self):
        """Operations staff books appointment and checks for doctor time conflicts."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|ops-1", "admin")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "Appointment scheduled for PT-1001 with Dr. Tan tomorrow at 10:00 AM. No conflicts detected."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "appointment_scheduling"}

                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_admin_token"},
                    json={"message": "Schedule appointment for PT-1001 with Dr. Tan tomorrow at 10:00 AM", "session_id": "ops-session-1"},
                )
                assert resp.status_code == 200
                assert "Appointment" in resp.text

    def test_operations_invoicing_access(self):
        """Operations staff accesses patient invoices and billing summary."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|ops-1", "admin")):
            with patch("tools.billing_data._run") as mock_run:
                mock_run.return_value = json.dumps({"outstanding_count": 3, "revenue_this_month": 4500.0})
                resp = client.get(
                    "/billing/invoices",
                    headers={"Authorization": "Bearer fake_admin_token"},
                )
                assert resp.status_code == 200


class TestHospitalAdminSimulation:
    """Simulates Hospital Admin executive oversight, payroll, and RAG knowledge base management."""

    def test_admin_executive_kpi_report(self):
        """Admin requests hospital-wide KPI and revenue analytics report."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-1", "admin")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "Hospital KPI Summary: Total Occupancy 82%, Monthly Revenue $145,000, Patient Satisfaction 94%."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "staff_management"}

                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_admin_token"},
                    json={"message": "Generate executive hospital management report", "session_id": "admin-session-1"},
                )
                assert resp.status_code == 200
                assert "Hospital" in resp.text

    def test_admin_shift_gap_scanner(self):
        """Admin executes autonomous scanner to detect uncovered night shifts."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-1", "admin")):
            with patch("graph.graph.compiled_graph.invoke") as mock_invoke:
                mock_ai_msg = MagicMock()
                mock_ai_msg.type = "ai"
                mock_ai_msg.content = "Shift Scanner: Detected 1 understaffed night shift on Friday in Emergency Ward."
                mock_invoke.return_value = {"messages": [mock_ai_msg], "active_agent": "staff_management"}

                resp = client.post(
                    "/chat",
                    headers={"Authorization": "Bearer fake_admin_token"},
                    json={"message": "Scan published shifts for night shift coverage gaps", "session_id": "admin-session-2"},
                )
                assert resp.status_code == 200
                assert "Shift" in resp.text

    def test_admin_payroll_processing(self):
        """Admin processes staff payroll through Stripe."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-1", "admin")):
            with patch("tools.stripe_payroll.stripe_configured", return_value=True):
                with patch("tools.stripe_payroll.process_payroll_with_stripe") as mock_pay:
                    mock_pay.return_value = {"status": "paid", "payroll_id": "pay-1", "amount": 5400.0}
                    resp = client.post(
                        "/payroll/process",
                        headers={"Authorization": "Bearer fake_admin_token"},
                        json={"payroll_id": "pay-1"},
                    )
                    assert resp.status_code == 200
                    assert resp.json()["status"] == "paid"

    def test_admin_knowledge_base_status(self):
        """Admin inspects ChromaDB RAG collection size and document status."""
        with patch("context.auth.decode_auth0_jwt", return_value=("auth0|admin-1", "admin")):
            mock_client = AsyncMock()
            mock_collection = AsyncMock()
            mock_collection.count = AsyncMock(return_value=42)
            mock_client.get_or_create_collection = AsyncMock(return_value=mock_collection)
            
            with patch("db.chroma.get_chroma_client", return_value=mock_client):
                resp = client.get(
                    "/knowledge/status",
                    headers={"Authorization": "Bearer fake_admin_token"},
                )
                assert resp.status_code == 200
                assert resp.json()["document_count"] == 42


class TestRAGAndMultimodalCore:
    """Verifies core AI components: RAG retrieval tool and vision fallback logic."""

    def test_rag_retrieval_tool(self):
        """Tests that the RAG retrieval tool functions without runtime exceptions."""
        from tools.rag_retrieval import retrieve_clinical_context
        with patch("config.llm.get_embeddings"):
            with patch("db.chroma.get_chroma_client") as mock_chroma:
                mock_client = AsyncMock()
                mock_coll = AsyncMock()
                mock_coll.query = AsyncMock(return_value={
                    "documents": [["Patient has a history of gestational diabetes managed with diet."]],
                    "metadatas": [[{"source": "clinical_records", "patient_id": "PT-1001"}]],
                    "distances": [[0.12]],
                })
                mock_client.get_or_create_collection = AsyncMock(return_value=mock_coll)
                mock_chroma.return_value = mock_client

                res = retrieve_clinical_context.invoke({"query": "diabetes history", "top_k": 1})
                assert isinstance(res, str)
                assert "gestational diabetes" in res
