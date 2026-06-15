# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

FinanceDash — SaaS financeiro multi-tenant para redes de carregadores EV (eletropostos). Monorepo com dois apps:

- `apps/api/` — FastAPI (Python 3.12), backend REST
- `apps/web/` — Next.js 16 + React 19 (TypeScript), frontend

---

## Commands

### Backend (`apps/api/`)

```bash
# Ambiente de desenvolvimento completo (banco + Redis + API com hot-reload)
docker compose -f docker-compose.dev.yml up -d

# Só infra (banco e Redis), API rodando local
docker compose up db redis -d
cd apps/api
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Worker Celery (opcional em dev)
celery -A app.workers.celery_app worker --loglevel=info

# Testes
cd apps/api
pytest                              # todos os testes com cobertura
pytest tests/test_auth.py           # arquivo específico
pytest -k "test_login"             # teste por nome

# Lint / formatação
ruff check app/                     # lint
ruff format app/                    # formatar
ruff check app/ --fix               # corrigir automaticamente

# Migrations
alembic revision --autogenerate -m "descrição"
alembic upgrade head
alembic downgrade -1
```

### Frontend (`apps/web/`)

```bash
cd apps/web
npm install --legacy-peer-deps      # sempre use --legacy-peer-deps
npm run dev                         # servidor de desenvolvimento (porta 3000)
npm run build                       # build de produção
npx tsc --noEmit                    # type check (sem emitir arquivos)
npm run lint                        # ESLint
```

### Docker produção

```bash
# Compose raiz (Dokploy / AWS ECS local)
docker compose up --build

# Compose de produção autônomo (com nginx)
cd prod && docker compose up -d
```

---

## Architecture

### Proxy de API

O Next.js faz proxy de **todos** os requests `/api/*` para a FastAPI via rewrite em `apps/web/next.config.ts`. O browser nunca faz requests cross-origin — usa sempre a mesma origem. Em Docker, `INTERNAL_API_URL=http://api:8000` roteia no servidor; em dev local usa `http://localhost:8000`.

O cliente axios em `apps/web/src/lib/api.ts` tem `baseURL: "/api/v1"` e injeta o `Authorization: Bearer <token>` em todo request autenticado. O token JWT (access) fica em memória (`accessToken` in-module); o refresh token fica em cookie `HttpOnly`.

### Multi-tenancy

Toda a data está escopo por `organization_id`. Os papéis de usuário são: `owner`, `admin`, `analyst`, `viewer` (enum `UserRole`). Existe também um sistema de **custom roles** com permissões granulares (ex.: `view_leads`, `manage_leads`).

A organização Intelbras tem `is_mother=True` e acesso ilimitado — nunca é bloqueada pelo `require_active_plan`. Usuários com `is_master=True` têm acesso ao painel `/dashboard/admin`.

### Planos e gating de 402

A dependency `require_active_plan` (em `apps/api/app/core/deps.py`) é aplicada nos routers `analytics`, `files`, `leads` e `capex`. Retorna `402 Payment Required` com `code: trial_expired | no_active_plan | payment_past_due | subscription_canceled` quando o plano não está ativo. Os routers `payback`, `alerts` e `user-notes` **não** têm esse gate.

### Processamento assíncrono

Upload de Excel (`.xlsx/.xls`) dispara tarefa Celery em `app/workers/tasks_files.py`. O worker processa os dados de sessões de recarga e popula `charging_sessions` (TimescaleDB). O status do processamento é exposto via polling no frontend.

**Celery Beat: NUNCA escalar acima de 1 réplica** — múltiplas instâncias causam tarefas duplicadas.

### Banco de dados

PostgreSQL 16 + extensão TimescaleDB (hypertable em `charging_sessions` para queries de série temporal eficientes). Portas: `5433` no host (dev e prod Docker), `5432` dentro da rede Docker. Em CI usa `5432` direto (sem Docker Compose de infra).

Migrations gerenciadas por Alembic em `apps/api/migrations/`. Em produção a migration roda via `ECS run-task` antes do deploy dos serviços (garantia de schema atualizado antes do novo código subir).

### Frontend — estrutura de rotas

```
src/app/
  (auth)/           login, register, forgot-password
  (dashboard)/
    dashboard/      página principal + sub-rotas:
      admin/        painel de admin (is_master only)
      billing/      planos e assinatura Stripe
      capex/        registro de CAPEX por carregador
      dre/          DRE mensal
      files/        upload e gestão de arquivos Excel
      investimento/ calculadora de payback
      leads/        CRM de leads
      map/          mapa de eletropostos (Leaflet + OpenChargeMap)
      relatorio/    relatórios exportáveis
      settings/     configurações da organização
      stations/     análise por estação
      team/         gestão de membros
      timeseries/   série temporal de sessões
      usuarios/     gestão de usuários (admin CRM)
```

### Contextos e dados no frontend

- `AuthContext` (`src/contexts/AuthContext.tsx`) — estado do usuário logado, token, org e plano.
- `FilterContext` (`src/contexts/FilterContext.tsx`) — filtros globais do dashboard (datas, arquivos, estações).
- SWR para data fetching; hooks em `src/hooks/` encapsulam os endpoints.
- Permissões verificadas via `src/lib/permissions.ts` e hook `usePermissions`.

### CI/CD

- **CI** (`.github/workflows/ci.yml`): roda em push/PR para `main` e `develop`. Pipeline: `backend-lint` → `backend-tests` (com Postgres + Redis reais) → `docker-build` (só em main/develop). Cobertura mínima: 60%.
- **Deploy** (`.github/workflows/deploy.yml`): só em push para `main`. Sequência: `ci` → `build-and-push` (ECR) → `migrate` (ECS run-task) → `deploy` (ECS update-service).
- ESLint no frontend tem `continue-on-error: true` (lint pode falhar sem bloquear CI enquanto não está limpo).
- `typescript.ignoreBuildErrors: true` no `next.config.ts` — build não falha por erros de tipo.

### Variáveis de ambiente

- Dev: `.env` na raiz (copiado de `.env.example`)
- Produção: `.env.production.example` como referência; nunca versionar `.env*` reais
- Variáveis `NEXT_PUBLIC_*` do Next.js **devem** estar em `apps/web/.env.local` (dev) ou injetadas no build do Docker — o Next.js não lê o `.env` da raiz do monorepo
- `DOCS_ACCESS_TOKEN`: quando definido em produção, protege `/api/docs` e `/api/redoc` com `?token=<valor>`

### Storage

`STORAGE_BACKEND=local` em dev (pasta `./uploads`). Em produção usa `s3` (Cloudflare R2, compatível com S3 via `boto3`). Trocar backend: alterar `STORAGE_BACKEND` e fornecer credenciais R2/S3.

### Auth

JWT: access token (15 min, em memória no frontend), refresh token (30 dias, cookie `HttpOnly`). Usa `PyJWT` — **não** `python-jose` (tem CVEs conhecidos). Biblioteca de hashing: `passlib[bcrypt]`.
