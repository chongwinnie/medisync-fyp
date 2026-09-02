"""RAG retrieval tool — ChromaDB similarity search for clinical context."""
from __future__ import annotations

import json

from langchain_core.tools import tool


@tool
def retrieve_clinical_context(
    query: str,
    patient_id: str | None = None,
    top_k: int = 5,
    collection_name: str = "medisync_clinical",
) -> str:
    """
    Retrieve relevant clinical knowledge chunks via ChromaDB vector similarity search.

    Args:
        query: The search query (symptom, condition, protocol, etc.).
        patient_id: Optional patient UUID to filter results to patient-specific docs.
        top_k: Number of results to return (default 5).
        collection_name: ChromaDB collection to search.

    Returns:
        JSON string of retrieved chunks with content and metadata.
    """
    import asyncio

    async def _search() -> str:
        try:
            from config.llm import get_embeddings
            from db.chroma import get_chroma_client

            embeddings_model = get_embeddings()
            query_embedding = await asyncio.to_thread(embeddings_model.embed_query, query)

            client = await get_chroma_client()
            collection = await client.get_or_create_collection(collection_name)

            where_filter = {"patient_id": patient_id} if patient_id else None

            results = await collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )

            chunks = []
            for i, doc in enumerate(results.get("documents", [[]])[0]):
                meta = (results.get("metadatas", [[]])[0] or [{}])[i]
                dist = (results.get("distances", [[]])[0] or [1.0])[i]
                chunks.append({"content": doc, "metadata": meta, "distance": round(dist, 4)})

            return json.dumps(chunks, ensure_ascii=False)

        except Exception as exc:
            # Graceful degradation if Chroma unavailable
            return json.dumps([{"content": f"[RAG unavailable: {exc}]", "metadata": {}, "distance": 1.0}])

    return asyncio.run(_search())
