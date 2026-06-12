import time
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine as db_engine
from app.core.deps import require_active_plan
from app.core.logging_config import setup_logging
from app.core.ratelimit import limiter
from app.core.redis import close_redis, get_redis
from app.routers import (
    admin,
    alerts,
    analytics,
    audit,
    auth,
    billing,
    capex,
    custom_roles,
    feedback,
    files,
    leads,
    organizations,
    payback,
    public,
    user_notes,
)

# ─── Inicialização ─────────────────────────────────────────────────────────────

setup_logging()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis()


# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FinanceDash API",
    version="1.0.0",
    summary="API da plataforma SaaS de gestão financeira para eletropostos",
    description="""
## Visão geral

A **FinanceDash API** fornece acesso programático a todos os recursos da plataforma:
analytics de sessões de recarga, DRE, payback, gestão de equipe, CRM de leads e muito mais.

## Autenticação

Todos os endpoints protegidos exigem um **Bearer token JWT** no cabeçalho:

```
Authorization: Bearer <access_token>
```

O token é obtido via `POST /api/v1/auth/login` e expira em **15 minutos**.
Use `POST /api/v1/auth/refresh` (cookie `refresh_token`) para renovar sem re-login.

## Rate limiting

- Endpoints de autenticação: **5–10 req/minuto por IP**
- Endpoints públicos (simulador): **10 req/minuto, 50 req/hora por IP**
- Demais endpoints: sem limite por padrão (limitados pelo plano)

## Planos e acesso

Os endpoints de analytics, arquivos e CRM exigem **plano ativo (trial ou pago)**.
Retornam `402 Payment Required` quando o trial expirou ou a assinatura foi cancelada.

## Paginação e filtros

Os endpoints de analytics aceitam query params comuns:
- `date_from` / `date_to` — intervalo de datas (ISO 8601)
- `files` — IDs de arquivos separados por vírgula
- `stations` — nomes de estações (multi-valor)
- `connectors` — tipos de conector (multi-valor)
""",
    contact={
        "name": "FinanceDash",
        "url": "https://financedash.com.br",
        "email": "api@financedash.com.br",
    },
    license_info={
        "name": "Proprietário — uso restrito",
        "url": "https://financedash.com.br/termos",
    },
    # Docs acessíveis sempre — protegidos por middleware de token em produção
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


# ─── OpenAPI customizado ────────────────────────────────────────────────────────

_TAGS_METADATA = [
    {
        "name": "auth",
        "description": "Registro, login, refresh de token, verificação de e-mail e gestão de perfil.",
    },
    {
        "name": "analytics",
        "description": (
            "Painéis financeiros derivados das sessões de recarga importadas. "
            "Todos os endpoints aceitam os mesmos query params de filtro (datas, arquivos, estações, conectores). "
            "**Exige plano ativo.**"
        ),
    },
    {
        "name": "files",
        "description": (
            "Upload e gestão de arquivos de sessões de recarga (.xlsx/.xls). "
            "O processamento é assíncrono via Celery. **Exige plano ativo.**"
        ),
    },
    {
        "name": "payback",
        "description": "Calculadora de payback, TIR, VPL e cenários de investimento. **Exige plano ativo.**",
    },
    {
        "name": "leads",
        "description": (
            "CRM de leads capturados pelo simulador público. "
            "Acesso controlado por permissões granulares `view_leads` e `manage_leads`. "
            "**Exige plano ativo.**"
        ),
    },
    {
        "name": "capex",
        "description": (
            "Registro de CAPEX por carregador/grupo com cálculo de payback real "
            "baseado nos dados de sessão importados. **Exige plano ativo.**"
        ),
    },
    {
        "name": "organizations",
        "description": "Gestão da organização: membros, convites e configurações.",
    },
    {
        "name": "custom-roles",
        "description": "Cargos customizáveis com permissões granulares para membros da equipe.",
    },
    {
        "name": "billing",
        "description": "Planos, assinaturas Stripe e portal de cobrança.",
    },
    {
        "name": "alerts",
        "description": "Alertas automáticos de KPIs com notificação por e-mail.",
    },
    {
        "name": "public",
        "description": (
            "Endpoints **sem autenticação** usados pela landing page. "
            "Incluem o simulador de investimento e captura de leads."
        ),
    },
    {
        "name": "user-notes",
        "description": "Notas pessoais por usuário (anotações privadas no dashboard).",
    },
    {
        "name": "audit",
        "description": "Log de auditoria de ações dos usuários (somente leitura, owner/admin).",
    },
    {
        "name": "admin",
        "description": (
            "Painel de Administrador — exclusivo para usuários **Mestres** da organização Intelbras. "
            "Permite gerenciar todas as organizações, usuários, planos e acessos da plataforma."
        ),
    },
]


def _build_openapi():
    """Gera o schema OpenAPI com security scheme Bearer e tags customizadas."""
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        summary=app.summary,
        description=app.description,
        contact=app.contact,
        license_info=app.license_info,
        routes=app.routes,
        tags=_TAGS_METADATA,
    )

    # Security scheme: Bearer JWT
    schema.setdefault("components", {})
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Token JWT obtido via `POST /api/v1/auth/login`. Expira em 15 minutos.",
        }
    }

    # Aplica o security a todos os endpoints, exceto os públicos
    PUBLIC_PATHS = {
        "/health",
        "/health/detailed",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/public/config",
        "/api/v1/public/simulate",
        "/api/v1/public/enterprise-contact",
        "/api/v1/billing/plans",
        "/api/v1/billing/webhook",
    }
    for path, path_item in schema.get("paths", {}).items():
        if path in PUBLIC_PATHS:
            continue
        for method_item in path_item.values():
            if isinstance(method_item, dict):
                method_item.setdefault("security", [{"BearerAuth": []}])

    app.openapi_schema = schema
    return schema


app.openapi = _build_openapi  # type: ignore[method-assign]


# ─── Middleware: proteção da UI Swagger em produção ────────────────────────────


@app.middleware("http")
async def _protect_docs(request: Request, call_next):
    """
    Em produção (DOCS_ACCESS_TOKEN definido), exige ?token=<valor> para
    acessar /api/docs, /api/redoc e /api/openapi.json.
    Em desenvolvimento (token vazio) a UI é aberta sem restrição.
    """
    if settings.docs_access_token:
        _DOC_PATHS = {"/api/docs", "/api/redoc", "/api/openapi.json"}
        if request.url.path in _DOC_PATHS:
            provided = request.query_params.get("token") or request.headers.get("X-Docs-Token")
            if provided != settings.docs_access_token:
                return JSONResponse(
                    {
                        "detail": "Acesso não autorizado. Informe o token correto via ?token=<valor>."
                    },
                    status_code=401,
                )
    return await call_next(request)


# ─── Rate limiting & CORS ──────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

# Sem restrição de plano
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(organizations.router, prefix="/api/v1/org", tags=["organizations"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])
app.include_router(custom_roles.router, prefix="/api/v1/org/custom-roles", tags=["custom-roles"])
app.include_router(public.router, prefix="/api/v1/public", tags=["public"])

# Exigem plano ativo (trial ou pago) — retornam 402 se expirado/cancelado
_plan_dep = [Depends(require_active_plan)]

app.include_router(
    analytics.router, prefix="/api/v1/analytics", tags=["analytics"], dependencies=_plan_dep
)
app.include_router(
    payback.router, prefix="/api/v1/payback", tags=["payback"], dependencies=_plan_dep
)
app.include_router(files.router, prefix="/api/v1/files", tags=["files"], dependencies=_plan_dep)
app.include_router(leads.router, prefix="/api/v1/leads", tags=["leads"], dependencies=_plan_dep)
app.include_router(capex.router, prefix="/api/v1/capex", tags=["capex"], dependencies=_plan_dep)

# Gestão — acessíveis mesmo com trial expirado
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])
app.include_router(user_notes.router, prefix="/api/v1/user-notes", tags=["user-notes"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["audit"])
app.include_router(feedback.router, prefix="/api/v1/feedback", tags=["feedback"])

# Painel de Administrador — exclusivo para Mestres da organização Intelbras
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])


# ─── Health checks ─────────────────────────────────────────────────────────────


@app.get("/health", tags=["health"], summary="Liveness probe", include_in_schema=True)
async def health():
    """
    Responde `200 {"status": "ok"}` imediatamente.
    Usado por load balancers e Docker healthchecks para verificar se o processo está vivo.
    Não verifica dependências externas.
    """
    return {"status": "ok"}


@app.get(
    "/health/detailed",
    tags=["health"],
    summary="Readiness probe — verifica DB e Redis",
    responses={
        200: {"description": "Todos os serviços disponíveis"},
        503: {"description": "Um ou mais serviços indisponíveis"},
    },
)
async def health_detailed():
    """
    Verifica a conectividade real com o banco de dados (PostgreSQL/TimescaleDB) e Redis.

    Retorna `200` quando todos os checks passam, ou `503` quando pelo menos um falha.
    Inclui latência de cada check em milissegundos.

    Usado por orquestradores (ECS, Kubernetes) para decidir quando direcionar tráfego
    para o container (readiness gate).
    """
    results: dict = {"status": "ok", "checks": {}}

    t0 = time.perf_counter()
    try:
        async with db_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        results["checks"]["database"] = {
            "status": "ok",
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }
    except Exception as exc:
        results["checks"]["database"] = {"status": "error", "detail": str(exc)}
        results["status"] = "degraded"

    t0 = time.perf_counter()
    try:
        redis = get_redis()
        await redis.ping()
        results["checks"]["redis"] = {
            "status": "ok",
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }
    except Exception as exc:
        results["checks"]["redis"] = {"status": "error", "detail": str(exc)}
        results["status"] = "degraded"

    status_code = 200 if results["status"] == "ok" else 503
    return JSONResponse(content=results, status_code=status_code)
