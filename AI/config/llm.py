"""Shared LLM factory — OpenAI primary, FreeLLMAPI optional fallback.

When OPENAI_API_KEY is set, all chat/embedding/vision calls use the official
OpenAI API (no FreeLLM proxy). FreeLLMAPI is only used when OpenAI is absent,
and always with a hard request timeout so a hung proxy cannot block agents.
"""
from __future__ import annotations

import logging

from config.settings import settings

logger = logging.getLogger("medisync.llm")

DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini"
DEFAULT_FREELLM_CHAT_MODEL = "auto"


def _openai_key() -> str:
    return (settings.openai_api_key or "").strip()


def _freellm_key() -> str:
    return (settings.freellmapi_api_key or "").strip()


def llm_provider() -> str:
    """Return 'openai' | 'freellm' | 'none' based on configured keys.

    OpenAI is primary when ``OPENAI_API_KEY`` is set and ``PREFER_OPENAI`` is
    true (default). Set ``PREFER_OPENAI=false`` to force FreeLLM even if an
    OpenAI key exists (debug only — FreeLLM remains hang-prone).
    """
    prefer = bool(getattr(settings, "prefer_openai", True))
    if _openai_key() and prefer:
        return "openai"
    if _freellm_key():
        return "freellm"
    if _openai_key():
        # prefer_openai=false but FreeLLM absent → still use OpenAI
        return "openai"
    return "none"


def get_chat_llm(
    temperature: float = 0.0,
    streaming: bool = False,
    model: str | None = None,
):
    """Return a ChatOpenAI client (OpenAI primary, FreeLLM fallback)."""
    from langchain_openai import ChatOpenAI

    provider = llm_provider()
    if provider == "openai":
        chat_model = model or settings.openai_chat_model or DEFAULT_OPENAI_CHAT_MODEL
        timeout = float(settings.openai_request_timeout_sec)
        logger.debug("get_chat_llm provider=openai model=%s timeout=%s", chat_model, timeout)
        return ChatOpenAI(
            model=chat_model,
            temperature=temperature,
            streaming=streaming,
            api_key=_openai_key(),
            timeout=timeout,
            max_retries=1,
        )

    if provider == "freellm":
        chat_model = model or DEFAULT_FREELLM_CHAT_MODEL
        timeout = float(settings.freellm_request_timeout_sec)
        logger.warning(
            "get_chat_llm provider=freellm model=%s timeout=%ss (OpenAI key not set)",
            chat_model,
            timeout,
        )
        return ChatOpenAI(
            model=chat_model,
            temperature=temperature,
            streaming=streaming,
            base_url=settings.freellmapi_base_url,
            api_key=_freellm_key(),
            timeout=timeout,
            max_retries=0,
        )

    raise RuntimeError(
        "No LLM provider configured. Set OPENAI_API_KEY (preferred) or FREELLMAPI_API_KEY."
    )


def get_embeddings(model: str | None = None):
    """Return OpenAIEmbeddings (OpenAI primary, FreeLLM fallback)."""
    from langchain_openai import OpenAIEmbeddings

    provider = llm_provider()
    if provider == "openai":
        embed_model = (
            model
            or settings.openai_embedding_model
            or settings.freellmapi_embedding_family
            or "text-embedding-3-large"
        )
        return OpenAIEmbeddings(
            model=embed_model,
            api_key=_openai_key(),
            timeout=float(settings.openai_request_timeout_sec),
            max_retries=1,
        )

    if provider == "freellm":
        return OpenAIEmbeddings(
            model=model or settings.freellmapi_embedding_family,
            base_url=settings.freellmapi_base_url,
            api_key=_freellm_key(),
            check_embedding_ctx_length=False,
            timeout=float(settings.freellm_request_timeout_sec),
            max_retries=0,
        )

    raise RuntimeError(
        "No embedding provider configured. Set OPENAI_API_KEY (preferred) or FREELLMAPI_API_KEY."
    )


def get_openai_client():
    """Return a raw OpenAI SDK client (vision, etc.)."""
    from openai import OpenAI

    provider = llm_provider()
    if provider == "openai":
        return OpenAI(
            api_key=_openai_key(),
            timeout=float(settings.openai_request_timeout_sec),
            max_retries=1,
        )

    if provider == "freellm":
        return OpenAI(
            base_url=settings.freellmapi_base_url,
            api_key=_freellm_key(),
            timeout=float(settings.freellm_request_timeout_sec),
            max_retries=0,
        )

    raise RuntimeError(
        "No OpenAI-compatible client configured. Set OPENAI_API_KEY (preferred) or FREELLMAPI_API_KEY."
    )


def get_vision_candidates() -> list[tuple[str, Any, str]]:
    """Return prioritized list of (provider_name, openai_client, model_name) for vision analysis.

    Supports Google Gemini, Groq, OpenRouter, FreeLLMAPI, and OpenAI with automatic fallback.
    """
    from openai import OpenAI

    candidates: list[tuple[str, Any, str]] = []
    gemini_key = (getattr(settings, "gemini_api_key", "") or getattr(settings, "google_api_key", "")).strip()
    groq_key = (getattr(settings, "groq_api_key", "") or "").strip()
    openrouter_key = (getattr(settings, "openrouter_api_key", "") or "").strip()
    freellm_key = _freellm_key()
    openai_key = _openai_key()

    override = (getattr(settings, "vision_provider", "auto") or "auto").lower().strip()

    def add_gemini():
        if gemini_key:
            client = OpenAI(
                api_key=gemini_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                timeout=float(getattr(settings, "openai_request_timeout_sec", 45.0)),
                max_retries=2,
            )
            primary = getattr(settings, "gemini_vision_model", "gemini-3.6-flash") or "gemini-3.6-flash"
            candidates.append(("gemini", client, primary))
            # Fallback Gemini models
            for alt_m in ["gemini-3.7-flash", "gemini-3-flash"]:
                if alt_m != primary:
                    candidates.append(("gemini", client, alt_m))

    def add_openrouter():
        if openrouter_key:
            client = OpenAI(
                api_key=openrouter_key,
                base_url="https://openrouter.ai/api/v1",
                timeout=float(getattr(settings, "openai_request_timeout_sec", 45.0)),
                max_retries=2,
            )
            primary = getattr(settings, "openrouter_vision_model", "google/gemini-3.7-flash") or "google/gemini-3.7-flash"
            candidates.append(("openrouter", client, primary))
            # Fallback OpenRouter models
            for alt_m in ["deepseek/deepseek-v4-flash-vision-exp", "qwen/qwen3.8-flash", "meta-llama/llama-3.2-11b-vision-instruct:free"]:
                if alt_m != primary:
                    candidates.append(("openrouter", client, alt_m))

    def add_freellm():
        if freellm_key:
            client = OpenAI(
                base_url=settings.freellmapi_base_url,
                api_key=freellm_key,
                timeout=float(settings.freellm_request_timeout_sec),
                max_retries=0,
            )
            model = getattr(settings, "freellm_vision_model", "gemini-3.6-flash") or "gemini-3.6-flash"
            candidates.append(("freellm", client, model))
            candidates.append(("freellm", client, "auto"))

    def add_groq():
        if groq_key:
            client = OpenAI(
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=float(getattr(settings, "openai_request_timeout_sec", 30.0)),
                max_retries=1,
            )
            model = getattr(settings, "groq_vision_model", "llama-3.3-70b-versatile") or "llama-3.3-70b-versatile"
            candidates.append(("groq", client, model))

    def add_openai():
        if openai_key:
            client = OpenAI(
                api_key=openai_key,
                timeout=float(settings.openai_request_timeout_sec),
                max_retries=1,
            )
            model = settings.openai_chat_model or "gpt-4o-mini"
            candidates.append(("openai", client, model))

    # Priority mapping based on override or auto detection
    if override == "openrouter":
        add_openrouter(); add_gemini(); add_freellm(); add_groq(); add_openai()
    elif override == "gemini":
        add_gemini(); add_openrouter(); add_freellm(); add_groq(); add_openai()
    elif override == "freellm":
        add_freellm(); add_gemini(); add_openrouter(); add_groq(); add_openai()
    elif override == "groq":
        add_groq(); add_openrouter(); add_gemini(); add_freellm(); add_openai()
    elif override == "openai":
        add_openai(); add_gemini(); add_openrouter(); add_freellm(); add_groq()
    else:  # auto
        # Prioritize OpenRouter and Gemini (both active & verified)
        add_openrouter()
        add_gemini()
        add_freellm()
        add_groq()
        add_openai()

    return candidates
