"""Mem0 client — OSS Memory.from_config (default) + cloud MemoryClient fallback."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import sys
import time
from typing import Any

from config.settings import settings

logger = logging.getLogger("medisync.mem0")

_oss_memory = None
_oss_init_error: str | None = None
_oss_status: str = "off"  # ok | error | off

# Short TTL search cache — cuts repeat-query embed latency (BUG-MEM0-2)
_SEARCH_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_CACHE_TTL_S = 300.0  # longer TTL cuts repeat embed cost in demo/viva
_SEARCH_CACHE_MAX = 256
_SEARCH_SOFT_BUDGET_S = 1.5
_SEARCH_HARD_TIMEOUT_S = 3.0  # fail-open sooner so chat stays snappy
_WARMED = False

# Skip Mem0 write for trivial acknowledgements
_TRIVIAL_RE = re.compile(
    r"^(ok|okay|thanks|thank you|thx|yes|no|yep|nope|sure|got it|cool)\.?$",
    re.I,
)
# Light PHI scrub before add
_PHI_PATTERNS = [
    re.compile(r"\b[STFG]\d{7}[A-Z]\b"),  # Singapore NRIC-like
    re.compile(r"\bMRN[:\s-]?\d{5,}\b", re.I),
]


def _search_cache_key(
    user_id: str,
    query: str,
    *,
    limit: int,
    agent_id: str | None,
    patient_id: str | None,
    user_role: str | None,
) -> str:
    raw = "|".join(
        [
            user_id,
            query.strip().lower(),
            str(limit),
            agent_id or "",
            patient_id or "",
            (user_role or "").lower(),
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str) -> list[dict] | None:
    entry = _SEARCH_CACHE.get(key)
    if not entry:
        return None
    expires_at, hits = entry
    if time.monotonic() > expires_at:
        _SEARCH_CACHE.pop(key, None)
        return None
    return list(hits)


def _cache_set(key: str, hits: list[dict]) -> None:
    if len(_SEARCH_CACHE) >= _SEARCH_CACHE_MAX:
        # Drop oldest ~25% by expiry
        ordered = sorted(_SEARCH_CACHE.items(), key=lambda kv: kv[1][0])
        for stale_key, _ in ordered[: max(1, _SEARCH_CACHE_MAX // 4)]:
            _SEARCH_CACHE.pop(stale_key, None)
    _SEARCH_CACHE[key] = (time.monotonic() + _SEARCH_CACHE_TTL_S, list(hits))


def mem0_status() -> str:
    """Return health status: ok | error | off."""
    mode = (settings.mem0_mode or "off").lower()
    if mode == "off":
        return "off"
    if mode == "cloud":
        return "ok" if settings.mem0_api_key else "off"
    # oss — ensure init attempted
    _ensure_oss()
    return _oss_status


async def warm_mem0_search() -> None:
    """Prime OSS Memory + embedder once so first user search hits soft budget.

    Uses a longer timeout than interactive search — first Chroma/embed init is slow.
    """
    global _WARMED
    if _WARMED:
        return
    mode = (settings.mem0_mode or "off").lower()
    if mode != "oss":
        _WARMED = True
        return
    try:
        _ensure_oss()
        # Bypass interactive hard timeout; cache the result for later hits.
        hits = await asyncio.wait_for(
            _search_oss(
                "__warmup__",
                "preferred ward",
                limit=1,
                agent_id=None,
                patient_id=None,
            ),
            timeout=45.0,
        )
        cache_key = _search_cache_key(
            "__warmup__",
            "preferred ward",
            limit=1,
            agent_id=None,
            patient_id=None,
            user_role=None,
        )
        _cache_set(cache_key, hits)
        logger.info("Mem0 warm-up complete (%.0f hits cached)", len(hits))
    except Exception as exc:
        logger.warning("Mem0 warm-up skipped: %s", exc)
    _WARMED = True


def _redact_phi(text: str) -> str:
    out = text
    for pat in _PHI_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    return out


def _serialize_messages(messages: list) -> list[dict[str, str]]:
    serialized: list[dict[str, str]] = []
    for m in messages:
        if isinstance(m, dict):
            role = str(m.get("role") or m.get("type") or "user")
            if role in ("human",):
                role = "user"
            elif role in ("ai",):
                role = "assistant"
            content = _redact_phi(str(m.get("content", "")))
            if content and role in ("user", "assistant", "system"):
                serialized.append({"role": role, "content": content})
            continue
        msg_type = getattr(m, "type", None)
        content = _redact_phi(str(getattr(m, "content", "") or ""))
        if not content:
            continue
        if msg_type == "human":
            serialized.append({"role": "user", "content": content})
        elif msg_type == "ai" and not getattr(m, "tool_calls", None):
            serialized.append({"role": "assistant", "content": content})
    return serialized


def _is_trivial_turn(messages: list[dict[str, str]]) -> bool:
    user_texts = [m["content"].strip() for m in messages if m["role"] == "user"]
    if not user_texts:
        return True
    return bool(_TRIVIAL_RE.match(user_texts[-1]))


def _mem0_llm_backend() -> str:
    """Choose Mem0 LLM/embed backend independently of chat primary.

    Prefer FreeLLM for Mem0 when configured so OpenAI quota is reserved for
    interactive chat (RATE-10-1). Falls back to OpenAI, then FreeLLM, then none.
    """
    has_freellm = bool((settings.freellmapi_api_key or "").strip())
    has_openai = bool((settings.openai_api_key or "").strip())
    prefer_freellm = bool(getattr(settings, "mem0_prefer_freellm", True))
    if prefer_freellm and has_freellm:
        return "freellm"
    if has_openai:
        return "openai"
    if has_freellm:
        return "freellm"
    return "none"


def _build_oss_config() -> dict[str, Any]:
    provider = _mem0_llm_backend()
    if provider == "openai":
        llm_model = settings.mem0_llm_model or settings.openai_chat_model or "gpt-4o-mini"
        embed_model = (
            settings.mem0_embedder_model
            or settings.openai_embedding_model
            or "text-embedding-3-large"
        )
        api_key = settings.openai_api_key or "unused"
        llm_cfg: dict[str, Any] = {"model": llm_model, "api_key": api_key}
        embed_cfg: dict[str, Any] = {"model": embed_model, "api_key": api_key}
    else:
        # freellm (or none → still point at FreeLLM base for clearer errors)
        llm_model = settings.mem0_llm_model or "auto"
        if llm_model and llm_model.startswith("gpt-"):
            # OpenAI model names often hang/fail on FreeLLM router — use auto
            llm_model = "auto"
        embed_model = settings.mem0_embedder_model or settings.freellmapi_embedding_family
        api_key = settings.freellmapi_api_key or settings.openai_api_key or "unused"
        base_url = settings.freellmapi_base_url
        llm_cfg = {
            "model": llm_model,
            "api_key": api_key,
            "openai_base_url": base_url,
        }
        embed_cfg = {
            "model": embed_model,
            "api_key": api_key,
            "openai_base_url": base_url,
        }

    vector_provider = (settings.mem0_vector_provider or "chroma").lower()
    if vector_provider == "pgvector":
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        vector_store = {
            "provider": "pgvector",
            "config": {
                "dbname": "medisync",
                "collection_name": settings.mem0_collection_name,
                "connection_string": dsn,
            },
        }
    else:
        # Dedicated Chroma collection via HTTP server (separate from medisync_clinical)
        vector_store = {
            "provider": "chroma",
            "config": {
                "collection_name": settings.mem0_collection_name,
                "host": settings.chroma_host,
                "port": settings.chroma_port,
            },
        }

    return {
        "llm": {"provider": "openai", "config": llm_cfg},
        "embedder": {"provider": "openai", "config": embed_cfg},
        "vector_store": vector_store,
        "version": "v1.1",
    }


def _ensure_oss():
    global _oss_memory, _oss_init_error, _oss_status
    mode = (settings.mem0_mode or "off").lower()
    if mode != "oss":
        _oss_status = "off"
        return None
    if _oss_memory is not None:
        return _oss_memory
    if _oss_init_error is not None:
        return None
    try:
        from mem0 import Memory

        config = _build_oss_config()
        _oss_memory = Memory.from_config(config)
        _oss_status = "ok"
        logger.info(
            "Mem0 OSS initialized (vector=%s collection=%s)",
            settings.mem0_vector_provider,
            settings.mem0_collection_name,
        )
        return _oss_memory
    except Exception as exc:
        _oss_init_error = str(exc)
        _oss_status = "error"
        print(f"[mem0_client] OSS init failed: {exc}", file=sys.stderr)
        return None


def _get_cloud_client():
    try:
        from mem0 import MemoryClient

        api_key = settings.mem0_api_key
        if not api_key:
            return None
        return MemoryClient(api_key=api_key)
    except ImportError:
        return None


def _normalize_search_results(raw: Any) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, dict):
        results = raw.get("results") or raw.get("memories") or []
        if isinstance(results, list):
            return [_normalize_hit(h) for h in results if h]
        return []
    if isinstance(raw, list):
        return [_normalize_hit(h) for h in raw if h]
    return []


def _normalize_hit(hit: Any) -> dict:
    if not isinstance(hit, dict):
        return {"memory": str(hit), "score": 0.0}
    memory = hit.get("memory") or hit.get("text") or hit.get("content") or ""
    score = hit.get("score")
    if score is None:
        score = hit.get("relevance_score", 0.0)
    meta = hit.get("metadata") or {}
    return {
        "id": hit.get("id"),
        "memory": str(memory),
        "score": float(score) if score is not None else 0.0,
        "metadata": meta,
    }


def format_mem0_prompt_block(hits: list[dict], *, max_chars: int = 800) -> str:
    """Format mem0_hits for injection into supervisor/agent prompts."""
    if not hits:
        return ""
    lines: list[str] = ["## Long-term memory (Mem0)"]
    used = len(lines[0])
    for hit in hits[:5]:
        text = str(hit.get("memory") or "").strip()
        if not text:
            continue
        score = hit.get("score")
        score_s = f"{float(score):.2f}" if score is not None else "?"
        line = f"- {text} (score={score_s})"
        if used + len(line) + 1 > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    if len(lines) == 1:
        return ""
    return "\n".join(lines)


def _filter_hits_by_role_patient(
    hits: list[dict],
    *,
    user_role: str | None,
    patient_id: str | None,
) -> list[dict]:
    """Prefer role-tagged memories; enforce patient isolation when patient_id set."""
    if not hits:
        return []

    filtered: list[dict] = []
    for hit in hits:
        meta = hit.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        mem_patient = meta.get("patient_id")
        if patient_id:
            # When querying for a patient, only return matching or untagged
            if mem_patient and str(mem_patient) != str(patient_id):
                continue
        else:
            # No patient in context — drop patient-linked memories
            if mem_patient:
                continue

        mem_role = meta.get("role")
        if user_role and mem_role and str(mem_role).lower() not in {
            str(user_role).lower(),
            "",
        }:
            # Keep untagged prefs; drop other-role tags
            continue
        filtered.append(hit)
    return filtered


async def search_memory(
    user_id: str,
    query: str,
    *,
    limit: int = 5,
    agent_id: str | None = None,
    patient_id: str | None = None,
    user_role: str | None = None,
) -> list[dict]:
    """Search Mem0 for relevant long-term memories. Returns [] on failure / off."""
    mode = (settings.mem0_mode or "off").lower()
    if mode == "off" or not user_id or not query.strip():
        return []

    cache_key = _search_cache_key(
        user_id,
        query,
        limit=limit,
        agent_id=agent_id,
        patient_id=patient_id,
        user_role=user_role,
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached[:limit]

    start = time.monotonic()
    try:
        if mode == "cloud":
            search_coro = _search_cloud(
                user_id, query, limit=limit, agent_id=agent_id
            )
        else:
            search_coro = _search_oss(
                user_id, query, limit=limit, agent_id=agent_id, patient_id=patient_id
            )
        try:
            hits = await asyncio.wait_for(search_coro, timeout=_SEARCH_HARD_TIMEOUT_S)
        except asyncio.TimeoutError:
            elapsed = time.monotonic() - start
            logger.warning(
                "Mem0 search timed out after %.2fs — fail-open empty", elapsed
            )
            return []

        hits = _filter_hits_by_role_patient(
            hits, user_role=user_role, patient_id=patient_id
        )
        hits = hits[:limit]
        _cache_set(cache_key, hits)
        elapsed = time.monotonic() - start
        if elapsed > _SEARCH_SOFT_BUDGET_S:
            logger.warning("Mem0 search slow: %.2fs — returning hits anyway", elapsed)
        return hits
    except Exception as exc:
        print(f"[mem0_client] search failed: {exc}", file=sys.stderr)
        return []


async def _search_oss(
    user_id: str,
    query: str,
    *,
    limit: int,
    agent_id: str | None,
    patient_id: str | None,
) -> list[dict]:
    memory = _ensure_oss()
    if memory is None:
        return []

    filters: dict[str, Any] = {"user_id": user_id}
    if agent_id:
        filters["agent_id"] = agent_id

    # Search-only path: vector similarity, no fact extraction / LLM rewrite
    def _run():
        try:
            return memory.search(
                query,
                filters=filters,
                top_k=limit,
                threshold=0.0,
            )
        except TypeError:
            # Older mem0 signatures omit threshold
            return memory.search(query, filters=filters, top_k=limit)

    raw = await asyncio.to_thread(_run)
    hits = _normalize_search_results(raw)
    # Post-filter patient in metadata (vector filters vary by store)
    if patient_id:
        hits = [
            h
            for h in hits
            if not (h.get("metadata") or {}).get("patient_id")
            or str((h.get("metadata") or {}).get("patient_id")) == str(patient_id)
        ]
    return hits


async def _search_cloud(
    user_id: str,
    query: str,
    *,
    limit: int,
    agent_id: str | None,
) -> list[dict]:
    client = _get_cloud_client()
    if client is None:
        return []

    def _run():
        kwargs: dict[str, Any] = {"query": query, "user_id": user_id, "limit": limit}
        if agent_id:
            kwargs["agent_id"] = agent_id
        return client.search(**kwargs)

    raw = await asyncio.to_thread(_run)
    return _normalize_search_results(raw)


async def invalidate_search_cache(user_id: str | None = None) -> None:
    """Drop cached searches (optionally for one user) after write_back add."""
    if user_id is None:
        _SEARCH_CACHE.clear()
        return
    # Keys are hashed — clear all on any add for that user (safe + simple)
    _SEARCH_CACHE.clear()


async def add_memory(
    user_id: str,
    messages: list,
    *,
    agent_id: str | None = None,
    run_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Store a conversation turn in Mem0 long-term memory (extracted facts)."""
    mode = (settings.mem0_mode or "off").lower()
    if mode == "off" or not user_id:
        return

    serialized = _serialize_messages(messages)
    if not serialized or _is_trivial_turn(serialized):
        return

    meta = dict(metadata or {})
    try:
        if mode == "cloud":
            await _add_cloud(user_id, serialized, agent_id=agent_id, run_id=run_id, metadata=meta)
        else:
            await _add_oss(user_id, serialized, agent_id=agent_id, run_id=run_id, metadata=meta)
        # New facts must be visible on the next search
        await invalidate_search_cache(user_id)
    except Exception as exc:
        print(f"[mem0_client] add failed (non-fatal): {exc}", file=sys.stderr)


async def _add_oss(
    user_id: str,
    messages: list[dict[str, str]],
    *,
    agent_id: str | None,
    run_id: str | None,
    metadata: dict,
) -> None:
    memory = _ensure_oss()
    if memory is None:
        return

    def _run():
        kwargs: dict[str, Any] = {
            "messages": messages,
            "user_id": user_id,
            "metadata": metadata or None,
        }
        if agent_id:
            kwargs["agent_id"] = agent_id
        if run_id:
            kwargs["run_id"] = run_id
        return memory.add(**kwargs)

    await asyncio.to_thread(_run)


async def _add_cloud(
    user_id: str,
    messages: list[dict[str, str]],
    *,
    agent_id: str | None,
    run_id: str | None,
    metadata: dict,
) -> None:
    client = _get_cloud_client()
    if client is None:
        return

    def _run():
        kwargs: dict[str, Any] = {
            "messages": messages,
            "user_id": user_id,
        }
        if agent_id:
            kwargs["agent_id"] = agent_id
        if run_id:
            kwargs["run_id"] = run_id
        if metadata:
            kwargs["metadata"] = metadata
        return client.add(**kwargs)

    await asyncio.to_thread(_run)
