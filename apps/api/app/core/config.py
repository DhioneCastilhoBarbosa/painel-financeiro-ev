from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Try to locate .env from project root; falls back gracefully if not found (Docker uses env vars directly)
def _find_env_file() -> str | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / ".env"
        if candidate.exists():
            return str(candidate)
    return None

_ENV_FILE = _find_env_file()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # App
    environment: str = "development"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000"
    # URL pública do frontend — usada nos links de e-mail transacional
    app_url: str = "http://localhost:3000"

    # Database
    database_url: str = "postgresql+asyncpg://financedash:financedash_dev@localhost:5432/financedash"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "CHANGE_ME_32_CHARS_MINIMUM_SECRET"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    # Storage
    storage_backend: str = "local"  # local | s3
    local_uploads_dir: str = "./uploads"
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "financedash-files"
    r2_public_url: str = ""

    # Email
    resend_api_key: str = ""
    email_from: str = "noreply@financedash.com.br"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_pro: str = ""

    # Documentação Swagger/OpenAPI
    # Se definido, a UI do Swagger exigirá ?token=<valor> na URL.
    # Em dev (valor vazio) a UI é aberta sem restrição.
    # Em produção defina um token aleatório para restringir acesso interno.
    docs_access_token: str = ""

    # Sentry
    sentry_dsn: str = ""
    # Fração de requests com distributed tracing (0.0 = off, 1.0 = 100%)
    # Em produção use 0.05-0.1 para evitar volume excessivo
    sentry_traces_sample_rate: float = 0.0
    # Fração de requests com CPU profiling (requer traces > 0)
    sentry_profiles_sample_rate: float = 0.0

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def cookie_secure(self) -> bool:
        """Cookies Secure só em HTTPS — em http://IP o browser ignora secure=True."""
        return self.app_url.lower().startswith("https://")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
