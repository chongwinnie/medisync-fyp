from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    auth0_domain: str
    auth0_audience: str

    # OpenAI — primary LLM provider (school credit grant / production path)
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-large"
    openai_request_timeout_sec: float = 45.0
    # Common typo seen in local env files — accepted as alias for openai_api_key
    opemai_api_key: str = ""

    # FreeLLMAPI proxy — optional fallback only when OpenAI key is absent
    freellmapi_base_url: str = "http://localhost:3001/v1"
    freellmapi_api_key: str = ""
    freellmapi_embedding_family: str = "text-embedding-3-large"
    freellm_request_timeout_sec: float = 12.0
    # When true and OpenAI is configured, FreeLLM is never contacted
    prefer_openai: bool = True

    mem0_api_key: str = ""
    # Mem0: oss (self-hosted Memory.from_config) | cloud | off
    mem0_mode: str = "oss"
    mem0_vector_provider: str = "chroma"  # chroma | pgvector
    mem0_collection_name: str = "medisync_mem0"
    mem0_llm_model: str = "gpt-4o-mini"
    mem0_embedder_model: str = ""  # empty → openai_embedding_model / freellm family
    # When true and FREELLMAPI_API_KEY is set, Mem0 extraction/embed uses FreeLLM
    # so OpenAI quota is reserved for chat (RATE-10-1). Chat still follows PREFER_OPENAI.
    mem0_prefer_freellm: bool = True
    langsmith_api_key: str = ""
    langchain_project: str = "medisync"
    resend_api_key: str = ""
    resend_from: str = "MediSync <onboarding@resend.dev>"
    celery_broker_url: str
    app_origin: str = "http://localhost:3000"

    # Stripe payroll (PaymentIntent demo path; optional Connect transfer)
    stripe_secret_key: str = ""
    stripe_currency: str = "myr"
    stripe_webhook_secret: str = ""

    # Google OAuth (Gmail + Calendar) — refresh-token flow
    google_client_id: str = ""
    google_client_secret: str = ""
    google_refresh_token: str = ""
    google_calendar_id: str = "primary"
    # Must match Google Cloud Console authorized redirect URI (see scripts/google_oauth_setup.py)
    google_redirect_uri: str = "http://localhost:8090/"
    # LIVE Gmail smoke recipient (strict_ext1_tests / LIVE-EXT-1)
    google_test_to: str = ""
    # Google Gemini — native multimodal vision & generation
    gemini_api_key: str = ""
    google_api_key: str = ""
    gemini_vision_model: str = "gemini-3.6-flash"

    # Groq — fast cloud LLM & vision
    groq_api_key: str = ""
    groq_vision_model: str = "llama-3.2-11b-vision-preview"

    # OpenRouter — multi-provider aggregator
    openrouter_api_key: str = ""
    openrouter_vision_model: str = "google/gemini-3.7-flash"

    # Vision provider override: "auto" | "gemini" | "groq" | "openrouter" | "freellm" | "openai"
    vision_provider: str = "auto"
    freellm_vision_model: str = "gemini-3.6-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator(
        "openai_api_key",
        "freellmapi_api_key",
        "stripe_secret_key",
        "google_refresh_token",
        mode="before",
    )
    @classmethod
    def _strip_keys(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def _merge_openai_typo_alias(self) -> "Settings":
        if not self.openai_api_key and self.opemai_api_key:
            self.openai_api_key = self.opemai_api_key.strip()
        return self


settings = Settings()
