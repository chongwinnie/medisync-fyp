"""Knowledge base management endpoints — upload docs to ChromaDB (Admin only)."""
from __future__ import annotations

import asyncio
import io
import json
import uuid

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

COLLECTION = "medisync_clinical"


def _admin_check(request: Request) -> bool:
    return getattr(request.state, "user_role", "") == "admin"


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        return pool.submit(asyncio.run, coro).result(timeout=120)


async def _chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end].strip())
        start += chunk_size - overlap
    return [c for c in chunks if c]


async def _extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract text from PDF or plain text file."""
    if filename.lower().endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            # Fallback: treat as text
            return file_bytes.decode("utf-8", errors="ignore")
    return file_bytes.decode("utf-8", errors="ignore")


@router.post("/knowledge/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    collection_name: str = Form(default=COLLECTION),
    source_label: str = Form(default=""),
):
    """
    Upload a PDF or text file to ChromaDB knowledge base. Admin only.
    Chunks the document and embeds via the configured embedding model.
    """
    if not _admin_check(request):
        return JSONResponse({"error": "Admin role required to update knowledge base."}, status_code=403)

    file_bytes = await file.read()
    filename = file.filename or "upload.txt"

    text = await _extract_text(file_bytes, filename)
    if not text.strip():
        return JSONResponse({"error": "Could not extract any text from the uploaded file."}, status_code=400)

    chunks = await _chunk_text(text)

    try:
        import inspect
        from config.llm import get_embeddings
        from db.chroma import get_chroma_client

        embedder = get_embeddings()
        texts = chunks
        embeddings = await asyncio.to_thread(embedder.embed_documents, texts)

        client_obj = get_chroma_client()
        client = await client_obj if inspect.isawaitable(client_obj) else client_obj

        coll_obj = client.get_or_create_collection(collection_name)
        collection = await coll_obj if inspect.isawaitable(coll_obj) else coll_obj

        doc_id = str(uuid.uuid4())
        label = source_label or filename
        ids = [f"upload:{doc_id}:{i}" for i in range(len(texts))]
        metadatas = [{"source": label, "upload_id": doc_id, "chunk": i, "type": "uploaded_document"} for i in range(len(texts))]

        add_obj = collection.add(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        if inspect.isawaitable(add_obj):
            await add_obj

        count_obj = collection.count()
        count = await count_obj if inspect.isawaitable(count_obj) else count_obj
        return JSONResponse({"chunks_added": len(texts), "collection": collection_name, "total_docs": count, "upload_id": doc_id}, status_code=201)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)


@router.get("/knowledge/status")
async def knowledge_status(request: Request):
    """Return document count per collection in ChromaDB. Admin only."""
    if not _admin_check(request):
        return JSONResponse({"error": "Admin role required."}, status_code=403)

    try:
        import inspect
        from db.chroma import get_chroma_client
        client_obj = get_chroma_client()
        client = await client_obj if inspect.isawaitable(client_obj) else client_obj

        coll_obj = client.get_or_create_collection(COLLECTION)
        collection = await coll_obj if inspect.isawaitable(coll_obj) else coll_obj

        count_obj = collection.count()
        count = await count_obj if inspect.isawaitable(count_obj) else count_obj
        return JSONResponse({"collection": COLLECTION, "document_count": count})
    except Exception as exc:
        return JSONResponse({"collection": COLLECTION, "document_count": 0, "error": str(exc)})


@router.post("/knowledge/reindex")
async def reindex_clinical(request: Request):
    """Re-ingest all Postgres clinical records into ChromaDB. Admin only. Runs async."""
    if not _admin_check(request):
        return JSONResponse({"error": "Admin role required."}, status_code=403)

    from tools.auto_reindex import trigger_continuous_reindex
    trigger_continuous_reindex(patient_id=None)
    return JSONResponse({"status": "reindex_triggered", "mode": "full", "message": "Clinical knowledge base re-indexing started in background."})


class AutoReindexRequest(BaseModel):
    patient_id: str | None = None


@router.post("/knowledge/auto-reindex")
async def auto_reindex_clinical(request: Request, body: AutoReindexRequest = AutoReindexRequest()):
    """Lightweight background trigger: automatically index clinical records when notes/diagnostics are saved."""
    from tools.auto_reindex import trigger_continuous_reindex
    trigger_continuous_reindex(patient_id=body.patient_id)
    return JSONResponse({
        "status": "reindex_triggered",
        "patient_id": body.patient_id,
        "message": f"Continuous re-indexing started in background for {'patient ' + body.patient_id if body.patient_id else 'all records'}.",
    })


@router.delete("/knowledge/document/{upload_id}")
async def delete_uploaded_document(request: Request, upload_id: str):
    """Delete all chunks for a given upload_id from ChromaDB. Admin only."""
    if not _admin_check(request):
        return JSONResponse({"error": "Admin role required."}, status_code=403)

    try:
        import inspect
        from db.chroma import get_chroma_client
        client_obj = get_chroma_client()
        client = await client_obj if inspect.isawaitable(client_obj) else client_obj

        coll_obj = client.get_or_create_collection(COLLECTION)
        collection = await coll_obj if inspect.isawaitable(coll_obj) else coll_obj

        get_obj = collection.get(where={"upload_id": upload_id})
        results = await get_obj if inspect.isawaitable(get_obj) else get_obj
        ids = results.get("ids", [])
        if ids:
            del_obj = collection.delete(ids=ids)
            if inspect.isawaitable(del_obj):
                await del_obj
        return JSONResponse({"deleted_chunks": len(ids), "upload_id": upload_id})
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
