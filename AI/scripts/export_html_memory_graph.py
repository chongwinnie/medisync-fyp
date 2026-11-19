#!/usr/bin/env python3
"""Export Mem0 memories into a standalone interactive Vis.js HTML Knowledge Graph.

Usage:
  .\.venv\Scripts\python.exe scripts/export_html_memory_graph.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, ".")


def generate_html_graph(output_file: str = "../documentation/memory_visualizer.html"):
    import chromadb

    client = chromadb.HttpClient(host="localhost", port="8001")
    col = client.get_collection("medisync_mem0")

    res = col.get()
    ids = res.get("ids", [])
    metadatas = res.get("metadatas", [])

    nodes = []
    edges = []

    nodes_added = set()

    def add_node(node_id, label, group, title="", val=10):
        if node_id not in nodes_added:
            nodes_added.add(node_id)
            nodes.append({
                "id": node_id,
                "label": label,
                "group": group,
                "title": title or label,
                "value": val
            })

    for idx, (mem_id, meta) in enumerate(zip(ids, metadatas), start=1):
        meta = meta or {}
        user_id = meta.get("user_id", "dev-user-doctor")
        role = meta.get("role", "doctor")
        agent_id = meta.get("agent_id", "supervisor")
        content = meta.get("data", "")
        created_at = meta.get("created_at", "N/A")

        # Group Nodes
        user_node = f"user_{user_id}"
        agent_node = f"agent_{agent_id}"
        mem_node = f"mem_{mem_id}"

        add_node(user_node, f"👤 User: {user_id}\n({role.upper()})", "user", f"User Role: {role}", 25)
        add_node(agent_node, f"🤖 Agent: {agent_id}", "agent", f"Specialist Agent: {agent_id}", 20)
        
        short_mem = content[:35] + "..." if len(content) > 35 else content
        add_node(mem_node, f"💡 #{idx:02d}: {short_mem}", "memory", f"<b>Memory #{idx:02d}</b><br>{content}<br><br><small>Created: {created_at}</small>", 15)

        edges.append({"from": user_node, "to": mem_node, "label": "created_by"})
        edges.append({"from": agent_node, "to": mem_node, "label": "extracted_by"})

        # Patient detection
        patient_matches = re.findall(r"(?:patient\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*\([^)]+\))?)", content)
        for p in patient_matches:
            if p.lower() not in ["user has", "user drafted", "user summarized", "user reviewed", "user wants"]:
                p_node = f"pat_{p}"
                add_node(p_node, f"🏥 Patient: {p}", "patient", f"Patient Record: {p}", 18)
                edges.append({"from": mem_node, "to": p_node, "label": "refers_to"})

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MediSync AI — Interactive Long-Term Memory Graph</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }}
        body {{ background-color: #0f172a; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }}
        header {{ background: #1e293b; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }}
        h1 {{ font-size: 20px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 10px; }}
        .badge {{ background: #0284c7; color: white; font-size: 12px; padding: 4px 10px; borderRadius: 20px; font-weight: 600; }}
        #container {{ display: flex; flex: 1; height: calc(100vh - 65px); }}
        #network {{ flex: 1; background: radial-gradient(circle, #1e293b 0%, #0f172a 100%); }}
        #sidebar {{ width: 360px; background: #1e293b; border-left: 1px solid #334155; padding: 20px; overflow-y: auto; }}
        .card {{ background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 16px; }}
        .card h3 {{ font-size: 14px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px; }}
        .card p {{ font-size: 14px; color: #e2e8f0; line-height: 1.5; }}
        .legend {{ display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }}
        .legend-item {{ display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; }}
        .dot {{ width: 12px; height: 12px; border-radius: 50%; display: inline-block; }}
        .btn {{ background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; }}
        .btn:hover {{ background: #0369a1; }}
    </style>
</head>
<body>
    <header>
        <h1> MediSync AI — Mem0 Long-Term Memory Vault Graph <span class="badge">{len(ids)} Memories Recorded</span></h1>
        <div style="display: flex; gap: 12px;">
            <button class="btn" onclick="network.fit()">Reset View</button>
        </div>
    </header>
    <div id="container">
        <div id="network"></div>
        <div id="sidebar">
            <div class="card">
                <h3>Legend</h3>
                <div class="legend">
                    <div class="legend-item"><span class="dot" style="background:#f59e0b"></span> User Role</div>
                    <div class="legend-item"><span class="dot" style="background:#06b6d4"></span> Specialist Agent</div>
                    <div class="legend-item"><span class="dot" style="background:#10b981"></span> Memory Record</div>
                    <div class="legend-item"><span class="dot" style="background:#a855f7"></span> Patient Entity</div>
                </div>
            </div>
            <div class="card" id="details-card">
                <h3>Node Inspector</h3>
                <p style="color: #64748b;">Click any node in the graph to inspect memory content, source agent, and timestamp.</p>
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
                font: {{ color: '#f8fafc', size: 14, face: 'Inter' }},
                borderWidth: 2,
                shadow: true
            }},
            edges: {{
                color: {{ color: '#475569', highlight: '#38bdf8' }},
                arrows: 'to',
                smooth: {{ type: 'cubicBezier' }}
            }},
            groups: {{
                user: {{ color: {{ background: '#f59e0b', border: '#d97706' }} }},
                agent: {{ color: {{ background: '#06b6d4', border: '#0891b2' }} }},
                memory: {{ color: {{ background: '#10b981', border: '#059669' }} }},
                patient: {{ color: {{ background: '#a855f7', border: '#7e22ce' }} }}
            }},
            physics: {{
                barnesHut: {{ gravitationalConstant: -3000, centralGravity: 0.3, springLength: 120 }}
            }}
        }};

        const network = new vis.Network(container, data, options);

        network.on("selectNode", function (params) {{
            const nodeId = params.nodes[0];
            const node = nodes.get(nodeId);
            const detailsCard = document.getElementById("details-card");

            detailsCard.innerHTML = `
                <h3>${{node.group.toUpperCase()}} NODE DETAILED VIEW</h3>
                <p><b>Label:</b> ${{node.label.replace('\\n', ' ')}}</p>
                <br>
                <p><b>Details / Content:</b></p>
                <p style="background: #1e293b; padding: 10px; border-radius: 6px; margin-top: 6px;">${{node.title}}</p>
            `;
        }});
    </script>
</body>
</html>
"""
    out_path = Path(output_file).resolve()
    out_path.write_text(html_content, encoding="utf-8")
    print(f"Successfully generated Interactive HTML Memory Visualizer at:\n  {out_path}")


if __name__ == "__main__":
    generate_html_graph()
