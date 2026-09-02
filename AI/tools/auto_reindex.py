"""Automated Continuous Re-indexing Engine for MediSync.

Provides continuous background sync between Postgres clinical records and ChromaDB RAG vector store.
Can be triggered synchronously, asynchronously (asyncio background task), or via Celery.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger("medisync.auto_reindex")


async def reindex_patient_clinical_records(patient_id: str) -> dict:
    """Incrementally extract and embed clinical records for a specific patient into ChromaDB."""
    try:
        import inspect
        from config.llm import get_embeddings
        from db.chroma import get_chroma_client
        from db.postgres import apg_connect
        from tools.ingest_clinical import BUILDERS, COLLECTION, EMBED_BATCH

        conn = await apg_connect()
        chunks = []
        try:
            for b in BUILDERS:
                # Query records for specific patient
                sql = b["sql"]
                if "WHERE" in sql:
                    filtered_sql = f"{sql} AND p.id = $1"
                else:
                    filtered_sql = f"{sql} WHERE p.id = $1"
                
                rows = await conn.fetch(filtered_sql, patient_id)
                for r in rows:
                    text, meta = b["build"](r)
                    chunks.append({
                        "id": f"{b['type']}:{r['id']}",
                        "text": text,
                        "metadata": meta,
                    })
        finally:
            await conn.close()

        if not chunks:
            return {"status": "ok", "patient_id": patient_id, "chunks_indexed": 0}

        embedder = get_embeddings()
        texts = [c["text"] for c in chunks]
        embeddings = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch_emb = await asyncio.to_thread(embedder.embed_documents, texts[i:i + EMBED_BATCH])
            embeddings.extend(batch_emb)

        client_obj = get_chroma_client()
        client = await client_obj if inspect.isawaitable(client_obj) else client_obj

        coll_obj = client.get_or_create_collection(COLLECTION)
        collection = await coll_obj if inspect.isawaitable(coll_obj) else coll_obj

        ids = [c["id"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        # Upsert (or add) into collection
        if hasattr(collection, "upsert"):
            upsert_fn = collection.upsert
        else:
            upsert_fn = collection.add

        add_res = upsert_fn(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        if inspect.isawaitable(add_res):
            await add_res

        logger.info("Auto-reindexed %d chunks for patient %s into %s", len(chunks), patient_id, COLLECTION)
        return {
            "status": "success",
            "patient_id": patient_id,
            "chunks_indexed": len(chunks),
            "collection": COLLECTION,
        }
    except Exception as exc:
        logger.warning("Continuous auto-reindexing error for patient %s: %s", patient_id, exc)
        return {"status": "error", "patient_id": patient_id, "error": str(exc)}


async def reindex_all_clinical_records() -> dict:
    """Full re-index of all Postgres clinical records into ChromaDB."""
    try:
        from tools.ingest_clinical import run_ingest_pipeline
        return await run_ingest_pipeline()
    except Exception as exc:
        logger.error("Full re-index error: %s", exc)
        return {"status": "error", "error": str(exc)}


def trigger_continuous_reindex(patient_id: Optional[str] = None) -> None:
    """Non-blocking background trigger.
    
    1. Tries dispatching via Celery task if broker available.
    2. Falls back to asyncio background task or daemon thread.
    """
    try:
        from workers.tasks.clinical_tasks import auto_reindex_clinical_records
        auto_reindex_clinical_records.delay(patient_id)
        logger.info("Dispatched reindex task to Celery for patient %s", patient_id)
        return
    except Exception:
        # Celery not running or broker unavailable -> run in background async task
        pass

    def _run_bg():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            if patient_id:
                loop.run_until_complete(reindex_patient_clinical_records(patient_id))
            else:
                loop.run_until_complete(reindex_all_clinical_records())
            loop.close()
        except Exception as err:
            logger.warning("Background reindex thread failed: %s", err)

    import threading
    t = threading.Thread(target=_run_bg, daemon=True, name=f"reindex-{patient_id or 'all'}")
    t.start()
