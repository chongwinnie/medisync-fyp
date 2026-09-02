"""Comprehensive deep tests for MediSync AI application:
- Billing tools, endpoints, and role-gating
- Hospital report generation tool and routing
- Knowledge base runtime update and role-gating
- Multi-agent supervisor classification and role-isolation
"""
import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from main import app
from tools.billing_data import get_patient_invoices, get_invoice_summary
from tools.billing_writeback import create_invoice, update_invoice_status
from tools.admin_report import generate_hospital_report
from graph.supervisor import _classify_intent, _rule_based_intent, supervisor_node, ROLE_AGENT_ACCESS
from langchain_core.messages import HumanMessage, AIMessage


@pytest.fixture
def test_client():
    return TestClient(app)


class TestBillingModule:
    @pytest.mark.asyncio
    async def test_billing_crud_and_calculations(self):
        # 1. Get a valid patient ID
        from db.postgres import apg_connect
        conn = await apg_connect()
        try:
            patient = await conn.fetchrow("SELECT id FROM patients LIMIT 1")
            assert patient is not None, "A patient record is required in DB"
            patient_id = str(patient["id"])
        finally:
            await conn.close()

        # 2. Create invoice
        line_items = [
            {"description": "General Consultation", "quantity": 1, "unit_price": 50.0},
            {"description": "Blood Test Panel", "quantity": 2, "unit_price": 25.0},
        ]
        created_json = create_invoice.invoke({
            "patient_id": patient_id,
            "line_items": line_items,
            "due_date": "2026-09-30",
            "tax_rate": 0.10,
            "notes": "Automated test invoice",
        })
        created = json.loads(created_json)
        assert "id" in created
        assert "invoice_number" in created
        assert created["invoice_number"].startswith("INV-")
        assert created["status"] == "draft"
        assert created["total_amount"] == 110.0  # 100 subtotal + 10 tax
        invoice_id = created["id"]

        # 3. Retrieve patient invoices
        invoices_json = get_patient_invoices.invoke({"patient_id": patient_id})
        invoices = json.loads(invoices_json)
        assert isinstance(invoices, list)
        found = next((i for i in invoices if i["id"] == invoice_id), None)
        assert found is not None
        assert found["invoice_number"] == created["invoice_number"]
        assert found["total_amount"] == 110.0

        # 4. Update status to 'paid'
        updated_json = update_invoice_status.invoke({"invoice_id": invoice_id, "status": "paid"})
        updated = json.loads(updated_json)
        assert updated["status"] == "paid"
        assert updated["paid_at"] is not None

        # 5. Check summary aggregation
        summary_json = get_invoice_summary.invoke({})
        summary = json.loads(summary_json)
        assert "outstanding_amount" in summary
        assert "paid_this_month" in summary
        assert summary["paid_this_month"] >= 1

    def test_billing_api_role_gating(self, test_client):
        # 1. Unauthenticated -> 401
        res_unauth = test_client.get("/billing/invoices")
        assert res_unauth.status_code == 401

        # 2. Authenticated as Doctor -> 403 (Denied)
        with patch("context.auth.decode_auth0_jwt", return_value=("usr_doc", "doctor")):
            res_doc = test_client.get("/billing/invoices", headers={"Authorization": "Bearer fake_doc_token"})
            assert res_doc.status_code == 403
            assert "cannot access billing" in res_doc.json().get("error", "")

        # 3. Authenticated as Admin -> 200 (Allowed)
        with patch("context.auth.decode_auth0_jwt", return_value=("usr_admin", "admin")):
            res_admin = test_client.get("/billing/summary", headers={"Authorization": "Bearer fake_admin_token"})
            assert res_admin.status_code == 200
            data = json.loads(res_admin.json()["data"])
            assert "outstanding_amount" in data


class TestAdminReportModule:
    def test_hospital_report_structure(self):
        report_json = generate_hospital_report.invoke({"period": "month"})
        report = json.loads(report_json)
        assert report["period"] == "month"
        assert "generated_at" in report
        assert "patients" in report
        assert "appointments" in report
        assert "inventory" in report
        assert "staff" in report
        assert "billing" in report

        # Verify key domain metrics exist
        assert "total_patients" in report["patients"]
        assert "total_items" in report["inventory"]
        assert "total_staff" in report["staff"]

    def test_hospital_report_routing(self):
        rule = _rule_based_intent("Generate the overall hospital management report")
        assert rule == "staff_management"


class TestKnowledgeBaseModule:
    def test_knowledge_base_role_gating(self, test_client):
        # 1. Unauthenticated -> 401
        res_unauth = test_client.get("/knowledge/status")
        assert res_unauth.status_code == 401

        # 2. Authenticated as Doctor -> 403
        with patch("context.auth.decode_auth0_jwt", return_value=("usr_doc", "doctor")):
            res_doc = test_client.get("/knowledge/status", headers={"Authorization": "Bearer fake_doc_token"})
            assert res_doc.status_code == 403

    def test_knowledge_base_status_admin(self, test_client):
        with patch("context.auth.decode_auth0_jwt", return_value=("usr_admin", "admin")):
            res = test_client.get("/knowledge/status", headers={"Authorization": "Bearer fake_admin_token"})
            assert res.status_code == 200
            assert "collection" in res.json()
            assert "document_count" in res.json()

    def test_knowledge_base_upload_and_delete(self, test_client):
        mock_embedder = MagicMock()
        mock_embedder.embed_documents.return_value = [[0.1] * 2048]

        with patch("context.auth.decode_auth0_jwt", return_value=("usr_admin", "admin")), \
             patch("config.llm.get_embeddings", return_value=mock_embedder):
            # Upload a text snippet
            sample_content = b"Clinical Guideline: Protocol for Acute Coronary Syndrome triage and ECG assessment."
            files = {"file": ("acs_guideline.txt", sample_content, "text/plain")}
            data = {"source_label": "ACS Protocol 2026"}
            
            res_upload = test_client.post(
                "/knowledge/upload",
                files=files,
                data=data,
                headers={"Authorization": "Bearer fake_admin_token"}
            )
            assert res_upload.status_code == 201
            upload_res = res_upload.json()
            assert upload_res["chunks_added"] >= 1
            upload_id = upload_res["upload_id"]

            # Delete the uploaded doc
            res_del = test_client.delete(
                f"/knowledge/document/{upload_id}",
                headers={"Authorization": "Bearer fake_admin_token"}
            )
            assert res_del.status_code == 200
            assert res_del.json()["deleted_chunks"] >= 1


class TestSupervisorIntentAndRoleIsolation:
    @pytest.mark.parametrize("query,expected_agent", [
        ("Patient PT-1043 vitals and treatment plan", "patient_management"),
        ("Analyze chest X-ray MRI imaging results", "medical_diagnostics"),
        ("Schedule an appointment for next Monday", "appointment_scheduling"),
        ("Check inventory stock and low supplies", "inventory_resource"),
        ("Who is on night shift duty and check shift gaps", "staff_management"),
        ("Create an invoice for patient billing", "appointment_scheduling"),
        ("Generate hospital management report for admin", "staff_management"),
    ])
    def test_intent_classification(self, query, expected_agent):
        ruled = _rule_based_intent(query)
        assert ruled == expected_agent

    def test_role_gating_contracts(self):
        # Doctor role allowed: patient_management, medical_diagnostics
        assert "patient_management" in ROLE_AGENT_ACCESS["doctor"]
        assert "medical_diagnostics" in ROLE_AGENT_ACCESS["doctor"]
        assert "staff_management" not in ROLE_AGENT_ACCESS["doctor"]

        # Nurse role allowed: patient_management, medical_diagnostics, inventory_resource
        assert "inventory_resource" in ROLE_AGENT_ACCESS["nurse"]
        assert "staff_management" not in ROLE_AGENT_ACCESS["nurse"]

        # Admin role allowed: all 5 agents
        assert len(ROLE_AGENT_ACCESS["admin"]) == 5
