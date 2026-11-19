#!/usr/bin/env python3
"""Export Mem0 long-term agent memories into an Obsidian Knowledge Vault.

Generates markdown files with [[bi-directional links]] between Users, Roles,
Specialist Agents, Patients, and Extracted Memories.

Usage:
  AI\.venv\Scripts\python.exe scripts/export_obsidian_memory_vault.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, ".")


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()


def export_vault(output_dir: str = "../documentation/Obsidian_Memory_Vault"):
    import chromadb

    client = chromadb.HttpClient(host="localhost", port="8001")
    try:
        col = client.get_collection("medisync_mem0")
    except Exception as e:
        print(f"Error connecting to Chroma collection medisync_mem0: {e}")
        return

    res = col.get()
    ids = res.get("ids", [])
    metadatas = res.get("metadatas", [])

    print(f"Found {len(ids)} long-term memories in Mem0 collection.")

    vault_path = Path(output_dir).resolve()
    vault_path.mkdir(parents=True, exist_ok=True)

    # Subdirectories
    users_dir = vault_path / "Users"
    agents_dir = vault_path / "Agents"
    memories_dir = vault_path / "Memories"
    patients_dir = vault_path / "Patients"

    for d in [users_dir, agents_dir, memories_dir, patients_dir]:
        d.mkdir(exist_ok=True)

    # Index page
    index_lines = [
        "# MediSync AI — Long-Term Agent Memory Vault",
        "",
        "This Obsidian Vault visualizes **Mem0 long-term memories** extracted across doctor consultations, patient care, diagnostic reviews, and staff operations.",
        "",
        "##  Vault Navigation",
        "- **[[Overview Graphs]]** — Visual node connections",
        "- **Users & Roles**: "
    ]

    users_seen = set()
    agents_seen = set()
    patients_seen = set()

    for idx, (mem_id, meta) in enumerate(zip(ids, metadatas), start=1):
        meta = meta or {}
        user_id = meta.get("user_id", "dev-user-doctor")
        role = meta.get("role", "doctor")
        agent_id = meta.get("agent_id", "supervisor")
        content = meta.get("data", "")
        created_at = meta.get("created_at", "N/A")

        users_seen.add(user_id)
        agents_seen.add(agent_id)

        # Detect patient references
        patient_matches = re.findall(r"(?:patient\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*\([^)]+\))?)", content)
        referenced_patients = []
        for p in patient_matches:
            if p.lower() not in ["user has", "user drafted", "user summarized", "user reviewed", "user wants"]:
                referenced_patients.append(p)
                patients_seen.add(p)

        # Write Memory page
        mem_filename = f"Memory_{idx:02d}_{sanitize_filename(content[:30])}.md"
        mem_file = memories_dir / mem_filename

        patient_links = "\n".join([f"- [[Patients/{p}]]" for p in referenced_patients]) if referenced_patients else "None detected"

        mem_content = f"""# Memory #{idx:02d}

> **Content**: {content}

## Metadata
- **Memory ID**: `{mem_id}`
- **Attributed User**: [[Users/{user_id}]]
- **User Role**: `{role}`
- **Originating Agent**: [[Agents/{agent_id}]]
- **Created At**: `{created_at}`
- **Entry Mode**: `{meta.get("entry_mode", "chat")}`

## Related Entities
{patient_links}

## Bi-directional Context
- User Profile: [[Users/{user_id}]]
- Agent Schema: [[Agents/{agent_id}]]
"""
        mem_file.write_text(mem_content, encoding="utf-8")

        # Write/Update User Page
        user_file = users_dir / f"{user_id}.md"
        user_mem_link = f"- [[Memories/{mem_filename[:-3]}|Memory #{idx:02d}]]: {content[:80]}..."
        if not user_file.exists():
            user_file.write_text(f"# User Profile: {user_id}\n\n- **Role**: `{role}`\n\n## Extracted Memories\n{user_mem_link}\n", encoding="utf-8")
        else:
            current = user_file.read_text(encoding="utf-8")
            if mem_filename[:-3] not in current:
                user_file.write_text(current + f"{user_mem_link}\n", encoding="utf-8")

        # Write/Update Agent Page
        agent_file = agents_dir / f"{agent_id}.md"
        agent_mem_link = f"- [[Memories/{mem_filename[:-3]}|Memory #{idx:02d}]]: {content[:80]}..."
        if not agent_file.exists():
            agent_file.write_text(f"# Specialist Agent: {agent_id}\n\n## Memory Traces Recorded\n{agent_mem_link}\n", encoding="utf-8")
        else:
            current = agent_file.read_text(encoding="utf-8")
            if mem_filename[:-3] not in current:
                agent_file.write_text(current + f"{agent_mem_link}\n", encoding="utf-8")

        # Write Patient Pages
        for p in referenced_patients:
            pat_file = patients_dir / f"{sanitize_filename(p)}.md"
            pat_mem_link = f"- [[Memories/{mem_filename[:-3]}|Memory #{idx:02d}]]: {content}"
            if not pat_file.exists():
                pat_file.write_text(f"# Patient Record: {p}\n\n## Long-Term Clinical Context Memories\n{pat_mem_link}\n", encoding="utf-8")
            else:
                current = pat_file.read_text(encoding="utf-8")
                if mem_filename[:-3] not in current:
                    pat_file.write_text(current + f"{pat_mem_link}\n", encoding="utf-8")

    # Finalize Index Page
    index_lines.append(", ".join([f"[[Users/{u}]]" for u in users_seen]))
    index_lines.append("- **Specialist Agents**: " + ", ".join([f"[[Agents/{a}]]" for a in agents_seen]))
    index_lines.append("- **Extracted Patient Contexts**: " + ", ".join([f"[[Patients/{p}]]" for p in patients_seen]))
    index_lines.append("\n## Graph Instructions")
    index_lines.append("1. Open this directory as a Vault in **Obsidian**.")
    index_lines.append("2. Click **Graph view** (Ctrl+G) to see the interactive 2D/3D knowledge graph of all long-term memories!")

    (vault_path / "README.md").write_text("\n".join(index_lines), encoding="utf-8")
    print(f"Successfully generated Obsidian Memory Vault at:\n  {vault_path}")


if __name__ == "__main__":
    export_vault()
