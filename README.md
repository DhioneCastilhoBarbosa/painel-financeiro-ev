# FinanceDash SaaS — Backend

Dashboard financeiro para redes de carregadores EV, transformado em plataforma SaaS multi-tenant.

## Stack

| Camada | Tecnologia |
|---|---|
| API | FastAPI (Python 3.12) |
| Banco | PostgreSQL 16 + TimescaleDB |
| Queue | Celery + Redis |
| ORM | SQLAlchemy 2.0 async + Alembic |
| Auth | JWT (python-jose) + bcrypt |
| Storage | Local (dev) / Cloudflare R2 (prod) |

## Subindo o ambiente local

### Pré-requisitos
- Docker Desktop instalado e rodando
- Python 3.11+ instalado

### 1. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Edite .env se necessário (padrões funcionam para dev local)
```

### 2. Subir banco e Redis via Docker
```bash
docker compose up db redis -d
```

### 3. Instalar dependências Python
```bash
cd apps/api
pip install -r requirements.txt
```

### 4. Rodar as migrations
```bash
cd apps/api
alembic upgrade head
```

### 5. Subir a API
```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```

### 6. (Opcional) Subir o worker Celery
```bash
cd apps/api
celery -A app.workers.celery_app worker --loglevel=info
```

### Alternativa: subir tudo via Docker
```bash
docker compose up --build
```

## Endpoints disponíveis

Com a API rodando, acesse a documentação interativa:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

### Fluxo básico de uso
```
POST /api/v1/auth/register    → Criar conta
POST /api/v1/auth/login       → Obter access token
POST /api/v1/files            → Upload do Excel
GET  /api/v1/analytics/kpis   → KPIs do dashboard
GET  /api/v1/analytics/dre    → DRE mensal
POST /api/v1/payback/calculate → Calcular payback
```

## Estrutura do projeto

```
apps/api/
├── app/
│   ├── core/           # Config, banco, auth, deps
│   ├── models/         # SQLAlchemy ORM (8 entidades)
│   ├── schemas/        # Pydantic schemas
│   ├── routers/        # Endpoints por domínio
│   ├── services/       # Business logic (analytics, payback, file_processor)
│   └── workers/        # Celery tasks
├── migrations/         # Alembic
└── requirements.txt
```

## Próximos passos (frontend)

O frontend Next.js será desenvolvido em `apps/web/`. Consulte o `ESCOPO_SAAS.md`
no repositório pai para o roadmap completo.
