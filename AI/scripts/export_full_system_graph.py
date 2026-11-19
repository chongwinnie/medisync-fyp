#!/usr/bin/env python3
"""Export Complete MediSync System Knowledge Graph.

Connects PostgreSQL records (Patients, Conditions, Medications, Reports, Appointments,
Staff, Inventory, Rooms, Payroll) AND ChromaDB Mem0 agent memories into a unified
Interactive Vis.js Network Graph + Obsidian Vault.

Usage:
  .\.venv\Scripts\python.exe scripts/export_full_system_graph.py
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, ".")


async def fetch_system_data():
    import asyncpg
    import chromadb
    from config.settings import settings

    conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5433/medisync")

    patients = await conn.fetch("SELECT id, patient_code, full_name, gender, blood_type, status FROM patients")
    conditions = await conn.fetch("SELECT patient_id, icd_code, condition_name, severity FROM patient_conditions WHERE is_active = true")
    medications = await conn.fetch("SELECT patient_id, drug_name, dosage, frequency FROM medications WHERE status = 'active'")
    reports = await conn.fetch("SELECT id, patient_id, report_type, title, findings, ai_summary, status FROM diagnostic_reports")
    vitals = await conn.fetch("SELECT patient_id, heart_rate, blood_pressure_sys, blood_pressure_dia FROM patient_vitals ORDER BY recorded_at DESC LIMIT 20")
    appointments = await conn.fetch("SELECT a.id, a.patient_id, a.staff_id, a.visit_type, a.status, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id LIMIT 15")
    staff = await conn.fetch("SELECT id, full_name, department, specialization FROM staff")
    inventory = await conn.fetch("SELECT item_name, category, current_stock, minimum_level FROM inventory_items")
    rooms = await conn.fetch("SELECT room_number, room_type, ward, status FROM rooms")

    await conn.close()

    # Mem0 memories
    memories = []
    try:
        client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        col = client.get_collection(settings.mem0_collection_name)
        res = col.get()
        ids = res.get("ids", [])
        metadatas = res.get("metadatas", [])
        for m_id, meta in zip(ids, metadatas):
            meta = meta or {}
            memories.append({
                "id": m_id,
                "content": meta.get("data", ""),
                "role": meta.get("role", "doctor"),
                "agent_id": meta.get("agent_id", "supervisor"),
                "user_id": meta.get("user_id", "dev-user")
            })
    except Exception as e:
        print(f"Warning: Mem0 Chroma query skipped: {e}")

    return {
        "patients": patients,
        "conditions": conditions,
        "medications": medications,
        "reports": reports,
        "vitals": vitals,
        "appointments": appointments,
        "staff": staff,
        "inventory": inventory,
        "rooms": rooms,
        "memories": memories
    }


def build_system_graph(data, output_html="../documentation/system_knowledge_graph.html"):
    nodes = []
    edges = []
    nodes_added = set()

    def add_node(n_id, label, group, title="", size=18, color=None):
        if n_id not in nodes_added:
            nodes_added.add(n_id)
            node_obj = {
                "id": n_id,
                "label": label,
                "group": group,
                "title": title or label,
                "value": size
            }
            if color:
                node_obj["color"] = color
            nodes.append(node_obj)

    # 1. CORE CATEGORY HUB NODES (Red/Coral Hubs matching user reference image)
    hubs = [
        ("hub_patients", "🏥 Patients Hub", "#ef4444"),
        ("hub_conditions", "🩺 Active Conditions", "#ef4444"),
        ("hub_medications", "💊 Medications", "#ef4444"),
        ("hub_reports", "🔬 Diagnostics & Scans", "#ef4444"),
        ("hub_appointments", "📅 Appointments & Shifts", "#ef4444"),
        ("hub_staff", "👨‍⚕️ Clinical Staff & HR", "#ef4444"),
        ("hub_inventory", "📦 Hospital Inventory", "#ef4444"),
        ("hub_rooms", "🛌 Rooms & Beds", "#ef4444"),
        ("hub_memories", "🧠 Mem0 AI Agent Memory", "#8b5cf6"),
    ]

    for hub_id, hub_label, hub_color in hubs:
        add_node(hub_id, hub_label, "hub", hub_label, size=35, color={"background": hub_color, "border": "#b91c1c"})

    # Map patient IDs for linking
    patient_id_map = {}
    for p in data["patients"]:
        pid = str(p["id"])
        p_code = p["patient_code"]
        name = p["full_name"]
        patient_id_map[pid] = (p_code, name)
        p_node_id = f"pat_{pid}"
        add_node(p_node_id, f"{p_code}\n{name}", "patient", f"<b>Patient:</b> {name} ({p_code})<br>Gender: {p['gender']}<br>Status: {p['status']}", size=20)
        edges.append({"from": "hub_patients", "to": p_node_id, "label": "HAS_PATIENT"})

    # Map staff IDs
    staff_id_map = {}
    for s in data["staff"]:
        sid = str(s["id"])
        s_name = s["full_name"]
        staff_id_map[sid] = s_name
        s_node_id = f"staff_{sid}"
        spec = s.get("specialization") or s.get("department") or "Clinical"
        add_node(s_node_id, f"Staff: {s_name}\n({spec})", "staff", f"<b>Staff:</b> {s_name}<br>Department: {s['department']}<br>Spec: {spec}", size=22, color={"background": "#0284c7", "border": "#0369a1"})
        edges.append({"from": "hub_staff", "to": s_node_id, "label": "EMPLOYED_AS"})

    # Conditions
    for c in data["conditions"]:
        pid = str(c["patient_id"])
        c_name = c["condition_name"]
        icd = c["icd_code"]
        c_node_id = f"cond_{pid}_{icd}"
        add_node(c_node_id, f"{c_name}\n[{icd}]", "condition", f"<b>Condition:</b> {c_name}<br>ICD Code: {icd}<br>Severity: {c['severity']}", size=14, color={"background": "#38bdf8", "border": "#0284c7"})
        edges.append({"from": "hub_conditions", "to": c_node_id, "label": "ICD_CODE"})
        if pid in patient_id_map:
            edges.append({"from": f"pat_{pid}", "to": c_node_id, "label": "DIAGNOSED_WITH"})

    # Medications
    for m in data["medications"]:
        pid = str(m["patient_id"])
        drug = m["drug_name"]
        dosage = m["dosage"]
        m_node_id = f"med_{pid}_{drug}"
        add_node(m_node_id, f"Rx: {drug}\n{dosage}", "medication", f"<b>Medication:</b> {drug}<br>Dosage: {dosage}<br>Freq: {m['frequency']}", size=14, color={"background": "#60a5fa", "border": "#2563eb"})
        edges.append({"from": "hub_medications", "to": m_node_id, "label": "PHARMACEUTICAL"})
        if pid in patient_id_map:
            edges.append({"from": f"pat_{pid}", "to": m_node_id, "label": "PRESCRIBED"})

    # Diagnostic Reports
    for r in data["reports"]:
        pid = str(r["patient_id"])
        r_title = r["title"]
        r_type = r["report_type"]
        r_node_id = f"rep_{r['id']}"
        add_node(r_node_id, f"Scan/Report:\n{r_title}", "report", f"<b>Report:</b> {r_title}<br>Type: {r_type}<br>Status: {r['status']}<br>AI Summary: {r.get('ai_summary', '')}", size=16, color={"background": "#f43f5e", "border": "#e11d48"})
        edges.append({"from": "hub_reports", "to": r_node_id, "label": "DIAGNOSTIC_SCAN"})
        if pid in patient_id_map:
            edges.append({"from": f"pat_{pid}", "to": r_node_id, "label": "HAS_REPORT"})

    # Appointments
    for idx, app in enumerate(data["appointments"]):
        pid = str(app["patient_id"]) if app["patient_id"] else None
        sid = str(app["staff_id"]) if app["staff_id"] else None
        vtype = app["visit_type"]
        app_node_id = f"app_{app['id']}"
        add_node(app_node_id, f"Appt: {vtype}\nStatus: {app['status']}", "appointment", f"<b>Appointment:</b> {vtype}<br>Status: {app['status']}", size=15, color={"background": "#fbbf24", "border": "#d97706"})
        edges.append({"from": "hub_appointments", "to": app_node_id, "label": "BOOKED_SLOT"})
        if pid and pid in patient_id_map:
            edges.append({"from": f"pat_{pid}", "to": app_node_id, "label": "SCHEDULED_FOR"})
        if sid and sid in staff_id_map:
            edges.append({"from": f"staff_{sid}", "to": app_node_id, "label": "ATTENDED_BY"})

    # Inventory
    for inv in data["inventory"]:
        item = inv["item_name"]
        stock = inv["current_stock"]
        inv_node_id = f"inv_{item}"
        add_node(inv_node_id, f"Stock: {item}\n({stock} left)", "inventory", f"<b>Item:</b> {item}<br>Category: {inv['category']}<br>Current Stock: {stock}", size=15, color={"background": "#34d399", "border": "#059669"})
        edges.append({"from": "hub_inventory", "to": inv_node_id, "label": "STOCK_ITEM"})

    # Rooms
    for rm in data["rooms"]:
        r_num = rm["room_number"]
        r_type = rm["room_type"]
        r_node_id = f"rm_{r_num}"
        add_node(r_node_id, f"Room {r_num}\n({r_type})", "room", f"<b>Room:</b> {r_num}<br>Type: {r_type}<br>Ward: {rm.get('ward', 'General')}", size=14, color={"background": "#a78bfa", "border": "#7c3aed"})
        edges.append({"from": "hub_rooms", "to": r_node_id, "label": "FACILITY_ROOM"})

    # Mem0 AI Memories
    for idx, mem in enumerate(data["memories"], start=1):
        content = mem["content"]
        agent = mem["agent_id"]
        role = mem["role"]
        mem_node_id = f"mem_{mem['id']}"
        short_txt = content[:30] + "..." if len(content) > 30 else content
        add_node(mem_node_id, f"AI Memory #{idx:02d}\n{short_txt}", "memory", f"<b>Mem0 AI Memory #{idx:02d}</b><br>{content}<br><br>Agent: {agent} | Role: {role}", size=16, color={"background": "#c084fc", "border": "#9333ea"})
        edges.append({"from": "hub_memories", "to": mem_node_id, "label": "EXTRACTED_BY_AGENT"})

        # Cross link memory to patients if mentioned
        for pid, (pcode, pname) in patient_id_map.items():
            if pname.lower() in content.lower() or pcode.lower() in content.lower():
                edges.append({"from": mem_node_id, "to": f"pat_{pid}", "label": "RECALLS_PATIENT"})

    # Build Standalone HTML Visualizer matching user reference image
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MediSync AI — Complete System & Hospital Data Relationship Graph</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }}
        body {{ background-color: #0b0f19; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }}
        header {{ background: #111827; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1f2937; }}
        h1 {{ font-size: 19px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 10px; }}
        .badge {{ background: #e11d48; color: white; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700; text-transform: uppercase; }}
        #container {{ display: flex; flex: 1; height: calc(100vh - 60px); }}
        #network {{ flex: 1; background: radial-gradient(circle at center, #111827 0%, #030712 100%); }}
        #sidebar {{ width: 380px; background: #111827; border-left: 1px solid #1f2937; padding: 20px; overflow-y: auto; }}
        .card {{ background: #030712; border: 1px solid #1f2937; border-radius: 10px; padding: 16px; margin-bottom: 16px; }}
        .card h3 {{ font-size: 13px; text-transform: uppercase; color: #9ca3af; margin-bottom: 10px; font-weight: 700; letter-spacing: 0.5px; }}
        .card p {{ font-size: 13px; color: #e5e7eb; line-height: 1.5; }}
        .legend {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }}
        .legend-item {{ display: flex; align-items: center; gap: 8px; font-size: 12px; color: #d1d5db; }}
        .dot {{ width: 12px; height: 12px; border-radius: 50%; display: inline-block; shrink: 0; }}
        .btn {{ background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 13px; }}
        .btn:hover {{ background: #0369a1; }}
    </style>
</head>
<body>
    <header>
        <h1> MediSync AI — System Data & Entity Relationship Graph <span class="badge">{len(nodes)} Network Nodes</span></h1>
        <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="network.fit()">Reset Camera View</button>
        </div>
    </header>
    <div id="container">
        <div id="network"></div>
        <div id="sidebar">
            <div class="card">
                <h3>Entity Groups</h3>
                <div class="legend">
                    <div class="legend-item"><span class="dot" style="background:#ef4444"></span> Central Hubs</div>
                    <div class="legend-item"><span class="dot" style="background:#0284c7"></span> Patients & Staff</div>
                    <div class="legend-item"><span class="dot" style="background:#38bdf8"></span> ICD-10 Conditions</div>
                    <div class="legend-item"><span class="dot" style="background:#60a5fa"></span> Active Medications</div>
                    <div class="legend-item"><span class="dot" style="background:#f43f5e"></span> Diagnostic Scans</div>
                    <div class="legend-item"><span class="dot" style="background:#fbbf24"></span> Appointments</div>
                    <div class="legend-item"><span class="dot" style="background:#34d399"></span> Inventory & Stock</div>
                    <div class="legend-item"><span class="dot" style="background:#c084fc"></span> Mem0 AI Memory</div>
                </div>
            </div>
            <div class="card" id="details-card">
                <h3>Entity Relationship Inspector</h3>
                <p style="color: #9ca3af;">Click any category hub or blue entity node to inspect exact PostgreSQL & ChromaDB database relationships.</p>
            </div>
        </div>
    </div>
    <script>
        const nodes = new vis.DataSet({json.dumps(nodes)});
        const edges = new vis.DataSet({json.dumps(edges)});

        const container = document.getElementById('network');
        const data = {{ nodes: nodes, edges: edges }};
        const options = {{
            nodes: {{
                shape: 'dot',
                font: {{ color: '#f8fafc', size: 13, face: 'Inter' }},
                borderWidth: 2,
                shadow: true
            }},
            edges: {{
                color: {{ color: '#374151', highlight: '#38bdf8' }},
                arrows: 'to',
                smooth: {{ type: 'cubicBezier' }},
                font: {{ color: '#9ca3af', size: 10, align: 'middle' }}
            }},
            physics: {{
                barnesHut: {{
                    gravitationalConstant: -4000,
                    centralGravity: 0.2,
                    springLength: 110,
                    springConstant: 0.04
                }}
            }}
        }};

        const network = new vis.Network(container, data, options);

        network.on("selectNode", function (params) {{
            const nodeId = params.nodes[0];
            const node = nodes.get(nodeId);
            const detailsCard = document.getElementById("details-card");

            const connectedEdges = network.getConnectedEdges(nodeId);
            const edgeLabels = connectedEdges.map(eId => edges.get(eId).label).join(', ');

            detailsCard.innerHTML = `
                <h3>NODE INSPECTOR: ${{node.group.toUpperCase()}}</h3>
                <p><b>Name/Label:</b> ${{node.label.replace('\\n', ' ')}}</p>
                <br>
                <p><b>Relationships / Edge Types:</b></p>
                <p style="color: #38bdf8; font-weight: 600; margin-top: 4px;">${{edgeLabels || 'None'}}</p>
                <br>
                <p><b>Database Details:</b></p>
                <div style="background: #111827; padding: 12px; border-radius: 6px; margin-top: 6px; border: 1px solid #1f2937;">${{node.title}}</div>
            `;
        }});
    </script>
</body>
</html>
"""

    out_path = Path(output_html).resolve()
    out_path.write_text(html_content, encoding="utf-8")
    print(f"Successfully generated Complete System Knowledge Graph at:\n  {out_path}")


async def main():
    print("Fetching system database records and ChromaDB Mem0 memories...")
    data = await fetch_system_data()
    build_system_graph(data)


if __name__ == "__main__":
    asyncio.run(main())
