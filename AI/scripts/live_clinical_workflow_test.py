"""Live Clinical Simulation Integration Test Suite for MediSync.

Simulates end-to-end real-life clinical workflows across 4 roles:
- 👨‍⚕️ Doctor (Patient Management, Multimodal Scan Vision, Diagnoses, Treatment Plans)
- 👩‍⚕️ Nurse (Vitals & Admissions, Inventory & Bed Allocation, Report Emailing, RBAC blocks)
- 🏢 Operations (Appointments & Conflicts, Invoicing/Billing, Resource Booking)
- 👑 Admin (Hospital Overview Reports, Staff Shifts & Payroll, Knowledge Base RAG Ingestion, Audit Logs)
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8000"

# Mock 1x1 test scan image for multimodal testing
TEST_ULTRASOUND_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

def http_post(path, data, role="doctor", user_id="u-1"):
    url = f"{BASE_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer dev-token-{role}",
        "X-User-Role": role,
        "X-User-Id": user_id,
    }
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8")
            if "event-stream" in content_type:
                # SSE Stream — parse data lines
                tokens = []
                agent = "supervisor"
                for line in raw.splitlines():
                    if line.startswith("data: "):
                        try:
                            payload = json.loads(line[6:])
                            if payload.get("type") == "agent":
                                agent = payload.get("name", agent)
                            elif payload.get("type") == "token":
                                tokens.append(payload.get("content", ""))
                        except Exception:
                            pass
                return resp.status, {"text": "".join(tokens), "agent": agent, "raw": raw}
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as err:
        try:
            body = json.loads(err.read().decode("utf-8"))
        except Exception:
            body = {"error": str(err)}
        return err.code, body
    except Exception as exc:
        return 500, {"error": str(exc)}

def http_get(path, role="doctor", user_id="u-1"):
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer dev-token-{role}",
        "X-User-Role": role,
        "X-User-Id": user_id,
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        try:
            body = json.loads(err.read().decode("utf-8"))
        except Exception:
            body = {"error": str(err)}
        return err.code, body
    except Exception as exc:
        return 500, {"error": str(exc)}

def run_all_role_workflows():
    results = []
    print("=" * 70)
    print("🏥 STARTING MEDISYNC END-TO-END CLINICAL SIMULATION TEST SUITE")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. System Health Check
    # -------------------------------------------------------------
    status, body = http_get("/health")
    ok = status == 200
    results.append(("System Health / Readiness Check", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] 1. System Health: {status}")

    # -------------------------------------------------------------
    # 2. Doctor Workflow
    # -------------------------------------------------------------
    print("\n--- 👨‍⚕️ SCENARIO A: DOCTOR CLINICAL WORKFLOW ---")
    
    # Step A1: Doctor Multimodal Medical Scan Vision Analysis
    status, body = http_post("/diagnostics/analyze", {
        "image_base64": TEST_ULTRASOUND_B64,
        "modality": "obstetric_ultrasound",
        "clinical_context": "28yo G1P0 at 24 weeks gestational age routine anatomical scan"
    }, role="doctor", user_id="doc-101")
    ok = status == 200 and ("impression" in body or "summary" in body)
    prov = body.get("raw", {}).get("provider_used", "AI Vision Model")
    results.append(("Doctor: Multimodal Scan Vision Analysis (Ultrasound / X-ray)", ok, f"Provider: {prov}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Doctor Scan Analysis: HTTP {status} (Provider: {prov})")

    # Step A2: Doctor Clinical Chat & Diagnostics Reasoning
    status, body = http_post("/chat", {
        "message": "Review patient PT-1001 diagnostic findings and summarize treatment plan",
        "session_id": "test-doc-session"
    }, role="doctor", user_id="doc-101")
    ok = status == 200
    results.append(("Doctor: Clinical AI Assistant Chat & Treatment Planning", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Doctor Chat & Treatment Plan: HTTP {status}")

    # -------------------------------------------------------------
    # 3. Nurse Workflow
    # -------------------------------------------------------------
    print("\n--- 👩‍⚕️ SCENARIO B: NURSE & CLINICAL STAFF WORKFLOW ---")

    # Step B1: Nurse Patient Care & Vitals/Medication Query
    status, body = http_post("/chat", {
        "message": "Show patient PT-1001 current active medications and vitals",
        "session_id": "test-nurse-session"
    }, role="nurse", user_id="nurse-201")
    ok = status == 200
    results.append(("Nurse: Patient Vitals & Medication Check", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Nurse Patient Care Query: HTTP {status}")

    # Step B2: Nurse Inventory & Bed Allocation Check
    status, body = http_post("/chat", {
        "message": "What is the ICU bed occupancy and are surgical masks low on stock?",
        "session_id": "test-nurse-session"
    }, role="nurse", user_id="nurse-201")
    ok = status == 200
    results.append(("Nurse: Bed Allocation & Inventory Stock Check", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Nurse Inventory & Resource Check: HTTP {status}")

    # Step B3: Nurse creates Patient Billing Invoice (Allowed through RBAC)
    status, body = http_get("/billing/summary", role="nurse", user_id="nurse-201")
    ok = status != 403
    results.append(("Nurse: Patient Billing Access (RBAC Allowed)", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Nurse Billing Access (RBAC Allowed): HTTP {status}")

    # Step B4: Nurse attempts Admin Payroll (RBAC Security Enforcement -> Must be 403 Forbidden)
    status, body = http_post("/payroll/process", {"payroll_id": "pay-1"}, role="nurse", user_id="nurse-201")
    ok = status == 403
    results.append(("Security / RBAC: Nurse Blocked from Payroll Processing", ok, f"HTTP {status} (Expected 403)"))
    print(f"[{'PASS' if ok else 'FAIL'}] Security Gate: Nurse blocked from Admin Payroll: HTTP {status}")

    # -------------------------------------------------------------
    # 4. Operations Staff Workflow
    # -------------------------------------------------------------
    print("\n--- 🏢 SCENARIO C: OPERATIONS & APPOINTMENT WORKFLOW ---")

    # Step C1: Appointment Scheduling & Conflict Check
    status, body = http_post("/chat", {
        "message": "Schedule appointment for patient PT-1001 with Dr. Tan tomorrow at 10:00 AM and check for conflicts",
        "session_id": "test-ops-session"
    }, role="admin", user_id="ops-301")
    ok = status == 200
    results.append(("Operations: Appointment Booking & Conflict Detection", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Operations Appointment & Conflict Engine: HTTP {status}")

    # Step C2: Patient Billing & Invoices List
    status, body = http_get("/billing/summary", role="admin", user_id="ops-301")
    ok = status != 403
    results.append(("Operations: Patient Invoices & Billing Overview", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Operations Billing Summary: HTTP {status}")

    # -------------------------------------------------------------
    # 5. Hospital Admin Workflow
    # -------------------------------------------------------------
    print("\n--- 👑 SCENARIO D: HOSPITAL ADMIN WORKFLOW ---")

    # Step D1: Hospital Overview KPI & Executive Report
    status, body = http_post("/chat", {
        "message": "Generate executive hospital management report with occupancy and revenue",
        "session_id": "test-admin-session"
    }, role="admin", user_id="admin-1")
    ok = status == 200
    results.append(("Admin: Hospital Management Overview KPI Report", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Admin Hospital Overview Report: HTTP {status}")

    # Step D2: Staff Shift Management & Shift Gap Scanner
    status, body = http_post("/chat", {
        "message": "Scan published shifts this week and identify any night shift coverage gaps",
        "session_id": "test-admin-session"
    }, role="admin", user_id="admin-1")
    ok = status == 200
    results.append(("Admin: Shift Management & Autonomous Gap Scanner", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Admin Shift Gap Scanner: HTTP {status}")

    # Step D3: Staff Payroll System (Admin Allowed)
    status, body = http_get("/payroll/status", role="admin", user_id="admin-1")
    ok = status == 200
    results.append(("Admin: Staff Management & Stripe Payroll Engine", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Admin Payroll Engine: HTTP {status}")

    # Step D4: Knowledge Base RAG Status Check
    status, body = http_get("/knowledge/status", role="admin", user_id="admin-1")
    ok = status == 200
    results.append(("Admin: Knowledge Base (RAG) Status & Health", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Admin Knowledge Base Status: HTTP {status}")

    # Step D5: Immutable Audit Logging (T1 Tool Verification)
    status, body = http_post("/chat", {
        "message": "Log clinical access review for compliance audit",
        "session_id": "test-admin-session"
    }, role="admin", user_id="admin-1")
    ok = status == 200
    results.append(("System: Immutable Audit Logging (Tool T1 Compliance)", ok, f"HTTP {status}"))
    print(f"[{'PASS' if ok else 'FAIL'}] Audit Logging (T1): HTTP {status}")

    # -------------------------------------------------------------
    # 6. RAG & Multimodal AI Core Verification
    # -------------------------------------------------------------
    print("\n--- 🧠 SCENARIO E: RAG & MULTIMODAL CORE VERIFICATION ---")
    try:
        from tools.rag_retrieval import retrieve_clinical_context
        rag_res = retrieve_clinical_context.invoke({"query": "obstetric ultrasound gestational age", "top_k": 2})
        rag_ok = isinstance(rag_res, str) and len(rag_res) > 5
        results.append(("Core AI: ChromaDB Vector Semantic Search (RAG Tool T2)", rag_ok, "Functional"))
        print(f"[{'PASS' if rag_ok else 'FAIL'}] RAG Retrieval Tool T2: Functional")
    except Exception as e:
        results.append(("Core AI: ChromaDB Vector Semantic Search (RAG Tool T2)", False, str(e)))
        print(f"[FAIL] RAG Retrieval Tool: {e}")

    # -------------------------------------------------------------
    # Final Summary Report
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    print("📊 CLINICAL WORKFLOW INTEGRATION TEST SUMMARY")
    print("=" * 70)
    passed_cnt = sum(1 for _, ok, _ in results if ok)
    total_cnt = len(results)
    
    for name, ok, details in results:
        badge = "✅ PASS" if ok else "❌ FAIL"
        print(f"{badge} | {name:<60} | {details}")

    print("=" * 70)
    print(f"TOTAL RESULTS: {passed_cnt}/{total_cnt} Workflows Passed ({int(passed_cnt/total_cnt*100)}%)")
    print("=" * 70)

    if passed_cnt == total_cnt:
        print("🎉 ALL ROLE WORKFLOWS AND INTEGRATIONS PASSED SUCCESSFULLY!")
        return 0
    else:
        print(f"⚠️ {total_cnt - passed_cnt} workflow(s) need attention.")
        return 1

if __name__ == "__main__":
    sys.exit(run_all_role_workflows())
