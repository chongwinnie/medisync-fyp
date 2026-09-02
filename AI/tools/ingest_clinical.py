"""Ingestion pipeline: Postgres clinical records -> FreeLLMAPI embeddings -> Chroma.

Run with:
    cd AI && .venv/bin/python -m tools.ingest_clinical
or:
    cd AI && .venv/bin/python tools/ingest_clinical.py

Idempotent: the medisync_clinical collection is deleted and recreated each run,
so re-ingesting after seed/data changes produces a clean index. Embeddings are
generated in batches via the FreeLLMAPI proxy (get_embeddings).
"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import asyncpg
import chromadb

from config.llm import get_embeddings
from config.settings import settings
from db.postgres import apg_connect

COLLECTION = "medisync_clinical"
EMBED_BATCH = 64

# Each builder: (type, sql, row -> (text, metadata)). patient name is joined in
# so each chunk is self-describing for semantic retrieval. record_id is the row
# PK so Chroma ids are deterministic and de-duplicated within a run.


def _fmt(v) -> str:
    if v is None:
        return "unknown"
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (UUID, Decimal)):
        return str(v)
    return str(v)


def _meta(patient_id, rtype, record_id, status=None) -> dict:
    m = {"patient_id": str(patient_id), "type": rtype, "record_id": str(record_id)}
    if status:
        m["status"] = str(status)
    return m


def _b_diagnostic_report(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Diagnostic report type {_fmt(r['report_type'])} titled {r['title']} for patient "
        f"{name} code {code}. Status {r['status']}. Date {_fmt(r['report_date'])}. "
        f"Findings {_fmt(r['findings'])}. AI summary {_fmt(r['ai_summary'])}. "
        f"AI-assisted {_fmt(r['ai_assisted'])}."
    )
    return text, _meta(r["patient_id"], "diagnostic_report", r["id"], r["status"])


def _b_patient_condition(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Condition for patient {name} code {code}: {r['condition_name']} "
        f"ICD {_fmt(r['icd_code'])}, severity {_fmt(r['severity'])}, "
        f"onset {_fmt(r['onset_date'])}, active {_fmt(r['is_active'])}."
    )
    status = "active" if r["is_active"] else "inactive"
    return text, _meta(r["patient_id"], "patient_condition", r["id"], status)


def _b_medication(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Medication for patient {name} code {code}: {r['drug_name']} {_fmt(r['dosage'])}, "
        f"{_fmt(r['frequency'])}, route {_fmt(r['route'])}, status {r['status']}, "
        f"from {_fmt(r['start_date'])} to {_fmt(r['end_date'])}. Notes {_fmt(r['notes'])}."
    )
    return text, _meta(r["patient_id"], "medication", r["id"], r["status"])


def _b_lab_result(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Lab result for patient {name} code {code}: {r['test_name']} = "
        f"{_fmt(r['result_value'])} {_fmt(r['unit'])}, reference {_fmt(r['reference_range'])}, "
        f"abnormal {_fmt(r['is_abnormal'])}, status {r['status']}, collected {_fmt(r['collected_at'])}."
    )
    return text, _meta(r["patient_id"], "lab_result", r["id"], r["status"])


def _b_case_history(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Case history for patient {name} code {code}: visit {_fmt(r['visit_type'])} "
        f"on {_fmt(r['visit_date'])}. Chief complaint {_fmt(r['chief_complaint'])}. "
        f"Assessment {_fmt(r['assessment'])}. Plan {_fmt(r['plan'])}. "
        f"Notes {_fmt(r['clinical_notes'])}."
    )
    return text, _meta(r["patient_id"], "case_history", r["id"])


def _b_treatment_plan(r):
    name, code = r["patient_name"], r["patient_code"]
    text = (
        f"Treatment plan for patient {name} code {code}: {r['title']}. "
        f"Objectives {_fmt(r['objectives'])}. Status {r['status']}. "
        f"AI-assisted {_fmt(r['ai_assisted'])}. AI draft {_fmt(r['ai_draft_content'])}. "
        f"Window {_fmt(r['start_date'])} to {_fmt(r['end_date'])}."
    )
    return text, _meta(r["patient_id"], "treatment_plan", r["id"], r["status"])


BUILDERS = [
    {
        "type": "diagnostic_report",
        "sql": """SELECT dr.id, dr.report_type, dr.title, dr.findings, dr.ai_summary,
                         dr.status, dr.ai_assisted, dr.report_date, dr.patient_id,
                         p.full_name AS patient_name, p.patient_code
                  FROM diagnostic_reports dr JOIN patients p ON p.id = dr.patient_id""",
        "build": _b_diagnostic_report,
    },
    {
        "type": "patient_condition",
        "sql": """SELECT pc.id, pc.icd_code, pc.condition_name, pc.severity, pc.onset_date,
                         pc.is_active, pc.patient_id, p.full_name AS patient_name, p.patient_code
                  FROM patient_conditions pc JOIN patients p ON p.id = pc.patient_id""",
        "build": _b_patient_condition,
    },
    {
        "type": "medication",
        "sql": """SELECT m.id, m.drug_name, m.dosage, m.frequency, m.route, m.status,
                         m.start_date, m.end_date, m.notes, m.patient_id,
                         p.full_name AS patient_name, p.patient_code
                  FROM medications m JOIN patients p ON p.id = m.patient_id""",
        "build": _b_medication,
    },
    {
        "type": "lab_result",
        "sql": """SELECT lr.id, lr.test_name, lr.result_value, lr.unit, lr.reference_range,
                         lr.is_abnormal, lr.status, lr.collected_at, lr.patient_id,
                         p.full_name AS patient_name, p.patient_code
                  FROM lab_results lr JOIN patients p ON p.id = lr.patient_id""",
        "build": _b_lab_result,
    },
    {
        "type": "case_history",
        "sql": """SELECT ch.id, ch.visit_type, ch.chief_complaint, ch.clinical_notes,
                         ch.assessment, ch.plan, ch.visit_date, ch.patient_id,
                         p.full_name AS patient_name, p.patient_code
                  FROM case_history ch JOIN patients p ON p.id = ch.patient_id""",
        "build": _b_case_history,
    },
    {
        "type": "treatment_plan",
        "sql": """SELECT tp.id, tp.title, tp.objectives, tp.status, tp.ai_assisted,
                         tp.ai_draft_content, tp.start_date, tp.end_date, tp.patient_id,
                         p.full_name AS patient_name, p.patient_code
                  FROM treatment_plans tp JOIN patients p ON p.id = tp.patient_id""",
        "build": _b_treatment_plan,
    },
]


async def _gather(conn: asyncpg.Connection) -> list[dict]:
    chunks: list[dict] = []
    for b in BUILDERS:
        rows = await conn.fetch(b["sql"])
        for r in rows:
            text, meta = b["build"](r)
            chunks.append({
                "id": f"{b['type']}:{r['id']}",
                "text": text,
                "metadata": meta,
            })
    return chunks


async def run_ingest_pipeline() -> dict:
    """Execute the clinical ingestion pipeline."""
    import inspect
    from db.chroma import get_chroma_client

    conn = await apg_connect()
    try:
        chunks = await _gather(conn)
    finally:
        await conn.close()

    if not chunks:
        return {"status": "ok", "chunks_ingested": 0, "collection": COLLECTION}

    embedder = get_embeddings()
    texts = [c["text"] for c in chunks]
    embeddings: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        embeddings.extend(await asyncio.to_thread(embedder.embed_documents, texts[i:i + EMBED_BATCH]))

    client_obj = get_chroma_client()
    client = await client_obj if inspect.isawaitable(client_obj) else client_obj

    try:
        del_res = client.delete_collection(COLLECTION)
        if inspect.isawaitable(del_res):
            await del_res
    except Exception:
        pass

    coll_res = client.get_or_create_collection(COLLECTION)
    collection = await coll_res if inspect.isawaitable(coll_res) else coll_res

    ids = [c["id"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]

    add_res = collection.add(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
    if inspect.isawaitable(add_res):
        await add_res

    count_res = collection.count()
    count = await count_res if inspect.isawaitable(count_res) else count_res

    by_type: dict[str, int] = {}
    for c in chunks:
        by_type[c["metadata"]["type"]] = by_type.get(c["metadata"]["type"], 0) + 1

    return {
        "status": "success",
        "chunks_ingested": count,
        "collection": COLLECTION,
        "by_type": by_type,
    }


async def main() -> None:
    res = await run_ingest_pipeline()
    print(f"Ingestion result: {res}")


if __name__ == "__main__":
    asyncio.run(main())
