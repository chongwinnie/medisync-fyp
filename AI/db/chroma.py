from __future__ import annotations

import os
import chromadb
from config.settings import settings

_client = None


async def get_chroma_client():
    global _client
    if _client is None:
        try:
            client = await chromadb.AsyncHttpClient(
                host=settings.chroma_host, port=settings.chroma_port
            )
            await client.heartbeat()
            _client = client
        except Exception:
            try:
                client = chromadb.HttpClient(
                    host=settings.chroma_host, port=settings.chroma_port
                )
                client.heartbeat()
                _client = client
            except Exception:
                # Fall back to local persistent client
                chroma_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_data")
                os.makedirs(chroma_dir, exist_ok=True)
                _client = chromadb.PersistentClient(path=chroma_dir)
    return _client
