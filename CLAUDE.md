# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dashboard financeiro SaaS multi-tenant para redes de carregadores EV (eletropostos), desenvolvido pela Intelbras.

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
# Se ruff não estiver no PATH local: python -m ruff format app/

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
# Compose raiz (Dokploy)
docker compose up --build

# Compose de produção autônomo (com nginx)
cd prod && docker compose up -d
```

---

## Stack

### API — Python (`apps/api/`)

| Camada | Tecnologia |
|---|---|
| Framework | FastAPI 0.115 + Uvicorn |
| Python | 3.12 |
| Banco | PostgreSQL 16 + TimescaleDB |
| ORM | SQLAlchemy 2.0 async + Alembic |
| Cache / filas | Redis 7 + Celery 5 (worker + beat) |
| Auth | PyJWT + bcrypt + passlib (python-jose substituído por ter CVEs) |
| Storage | WebDAV (prod: nginx em 54.159.164.244:8083) / Local (dev) / Cloudflare R2 (opcional) |
| Email | SMTP via `postal.intelbras.com.br:2525` STARTTLS — tem prioridade sobre Resend |
| PDF | ReportLab + Plotly/Kaleido |
| Monitoring | Sentry SDK |
| Rate limit | slowapi |

### Web — TypeScript (`apps/web/`)

| Camada | Tecnologia |
|---|---|
| Framework | Next.js **16.2.6** App Router — **não é Vite** |
| React | 19.2.4 |
| Estilo | Tailwind CSS 4 |
| Componentes | ShadCN / **Base UI** (`@base-ui/react`) — botões usam Base UI, não ShadCN padrão |
| Forms | react-hook-form + zod |
| Gráficos | Recharts |
| Mapas | Leaflet + react-leaflet + leaflet.heat + leaflet.markercluster (importação dinâmica obrigatória) |
| Estado / fetch | SWR + Axios |
| Notificações | Sonner |

---

## Infraestrutura de produção

- **Servidor**: AWS EC2 `54.159.164.244`
- **Deploy**: Dokploy (orquestra `docker-compose.prod.yml`)
- **Portas no host**: web → 3003 | api → 8001 | postgres → 5435 | redis → 6380
- **URL pública**: `http://54.159.164.244:3003`
- **Acesso direto à API/Swagger**: `http://54.159.164.244:8001`
- **Após deploy**: sempre rodar `alembic upgrade head` dentro do container `api`

### Variáveis de ambiente relevantes (Dokploy → Environment)
```
APP_URL=http://54.159.164.244:3003        # usado em links de e-mail
SMTP_HOST=postal.intelbras.com.br
SMTP_PORT=2525
SMTP_USER=licenca.cve
SMTP_PASSWORD=aPCPNYVhEMMmw0mR86q0kzag
SMTP_FROM=licenca.cve@intelbras.com.br
LEAD_NOTIFY_ALWAYS=                       # vazio — não notifica nenhum e-mail fixo
```

---

## Estrutura de rotas — Frontend

### Auth (`/apps/web/src/app/(auth)/`)
| Rota | Arquivo |
|---|---|
| `/login` | `login/page.tsx` |
| `/register` | `register/page.tsx` |
| `/forgot-password` | `forgot-password/page.tsx` |
| `/reset-password?token=...` | `reset-password/page.tsx` — requer `<Suspense>` por usar `useSearchParams()` |
| `/verify-email?token=...` | `verify-email/page.tsx` — chama `POST /auth/verify-email` no mount |
| `/accept-invite?token=...` | `accept-invite/page.tsx` — valida via `GET /auth/invite-lookup`, exibe form de cadastro |

### Dashboard (`/apps/web/src/app/(dashboard)/dashboard/`)
| Rota | Conteúdo |
|---|---|
| `/dashboard` | Overview KPIs |
| `/dashboard/dre` | DRE mensal |
| `/dashboard/timeseries` | Sessões ao longo do tempo |
| `/dashboard/stations` | Estações de carregamento |
| `/dashboard/files` | Upload de planilhas Excel |
| `/dashboard/relatorio` | Geração de PDF |
| `/dashboard/investimento` | Simulador de payback/ROI |
| `/dashboard/capex` | CAPEX de equipamentos |
| `/dashboard/leads` | CRM de leads (simulador público) |
| `/dashboard/map` | Análise de locais — mapa choropleth por estado |
| `/dashboard/billing` | Planos e assinatura |
| `/dashboard/team` | Gerenciamento de membros |
| `/dashboard/usuarios` | Admin: todos usuários (cross-tenant) |
| `/dashboard/admin` | Painel de administrador Intelbras |
| `/dashboard/settings` | Configurações da organização |
| `/dashboard/profile` | Perfil do usuário |
| `/dashboard/feedback` | Sugestões e reclamações |

### Páginas públicas
| Rota | Conteúdo |
|---|---|
| `/` | Landing page |
| `/solucao` | Página de solução |
| `/manual` | Manual do usuário |

---

## Backend — Routers e modelos

### Routers (`apps/api/app/routers/`)
- `auth.py` — register, login, refresh, logout, verify-email, forgot-password, reset-password, /me
- `analytics.py` — KPIs, DRE, timeseries, estações
- `files.py` — upload Excel, listagem, download
- `payback.py` — cálculo de payback / ROI / VPL
- `capex.py` — CAPEX de equipamentos
- `leads.py` — CRM de leads (autenticado)
- `public.py` — simulador público (sem auth), enterprise-contact
- `organizations.py` — CRUD de orgs, convites, planos
- `billing.py` — Stripe webhooks, planos
- `alerts.py` — alertas de métricas (Celery beat)
- `feedback.py` — sugestões/reclamações
- `audit.py` — log de ações
- `user_notes.py` — notas por usuário
- `custom_roles.py` — papéis customizados por org
- `admin.py` — painel Intelbras (requer `is_master=True` + `org.is_mother=True`)

### Modelos SQLAlchemy (`apps/api/app/models/`)
`user`, `organization`, `subscription`, `data_file`, `charging_session`, `cost_configuration`,
`payback_scenario`, `charger_capex`, `simulator_config`, `lead`, `lead_notification_email`,
`org_invite_code`, `invitation`, `alert`, `audit_log`, `feedback`, `custom_role`, `user_note`

### Planos de assinatura
`Trial` → `Free` → `Starter` → `Pro` → `Enterprise`
Configurados em `apps/api/app/data/plan_configs.json` (gerado automaticamente no primeiro deploy).

---

## E-mail — Templates e triggers

Todos em `apps/api/app/services/email.py`. SMTP tem prioridade sobre Resend.

| Função | Assunto | Trigger |
|---|---|---|
| `send_verify_email` | Verifique seu e-mail | Registro de novo usuário |
| `send_reset_password_email` | Redefinição de senha | POST `/auth/forgot-password` |
| `send_invite_email` | Convite para [org] | Admin convida membro |
| `send_trial_ending_email` | Trial termina em breve | Celery beat (N dias antes do fim) |
| `send_lead_confirmation_email` | Simulação de ROI | Lead envia simulador público |
| `send_lead_notification_email` | Novo lead | Lead envia simulador → notifica admins |
| `send_specialist_contact_notification` | Lead quer falar com especialista | Lead envia mensagem para especialista |
| `send_feedback_response_email` | Resposta à sugestão/reclamação | Admin responde feedback |
| `send_alert_triggered_email_sync` | Alerta disparado: [nome] | Celery beat avalia métricas |

**Destinatários de leads**: `lead_notify_always` (env var, vazio por padrão) + tabela `LeadNotificationEmail` filtrada por estado.

---

## Mapa (`/dashboard/map`)

- Modo ativo: choropleth por estado + Top 10 municípios
- **Camadas adicionais e sistema de pesos desligados** — não implementar/exibir por ora
- Importação de Leaflet é sempre dinâmica (`next/dynamic` com `ssr: false`) por ser Next.js App Router

---

## Problemas conhecidos e workarounds

### SMTP — SSL DH key pequena
`postal.intelbras.com.br` usa chaves DH pequenas rejeitadas por OpenSSL moderno.
Workaround em `_send_via_smtp`: `ctx.set_ciphers("DEFAULT:@SECLEVEL=1")`.

### Base UI (`@base-ui/react`) sobrescreve `color` inline
O componente `<Button>` aplica `text-primary-foreground` que tem prioridade sobre `style={{ color }}`.
**Solução**: usar `<button>` nativo HTML com `style={{ backgroundColor, color }}` explícito quando necessário.
Exemplo: `forgot-password/page.tsx` e `reset-password/page.tsx`.

### Next.js — `useSearchParams()` exige `<Suspense>`
Qualquer página que usa `useSearchParams()` precisa ser envolta em `<Suspense>` para build estático funcionar.
Padrão aplicado: componente interno `MyForm` + export default `MyPage` com `<Suspense fallback={null}>`.

### Leaflet — importação dinâmica obrigatória
Next.js App Router não suporta Leaflet com SSR. Todos os componentes de mapa devem usar `next/dynamic` com `{ ssr: false }`.

### FastAPI 204 + anotação de retorno = crash no import
Endpoints com `status_code=204` **não podem** ter `response_model` ou `-> None` com tipo de retorno anotado de forma incorreta.
Verificar com `python -c "import app.main"` antes de commitar — `py_compile` não detecta esse erro.

### Emojis em assuntos de e-mail bloqueados pelo servidor Intelbras
O servidor de e-mail `@intelbras.com.br` rejeita mensagens com emoji no assunto.
**Nunca adicionar emoji em `subject` ou corpo principal dos e-mails.**

### PDF export — padrão `window.print()` com dark mode
Usar `beforeprint` (síncrono, garantido antes do snapshot de print) — NÃO usar double `requestAnimationFrame` (timing não garantido).
Padrão: registrar `beforeprint` → remover `.dark` + injetar `<style data-print-override>` com regras de tela (sem `@media print`) cobrindo `background-color`, `border-color`, `outline`, `box-shadow`. Em `afterprint`: restaurar `.dark` + remover `<style>` + desregistrar listeners.
`globals.css @media print` já tem regras de CSS puro para fallback (border-color, background, variáveis CSS). As duas camadas (CSS estático + JS dinâmico no `beforeprint`) são complementares.
Páginas com esse padrão: `relatorio/page.tsx` (handlePrint) e `investimento/page.tsx` (handlePrint e handleSimplePrint).

### FastAPI — `CurrentUser` + `UploadFile`
`CurrentUser = Annotated[User, Depends(...)]` — nunca adicionar `= Depends()` nem `= ...`. Em endpoints com `UploadFile`, colocar `current_user: CurrentUser` antes de `file: UploadFile = File(...)`.

### Logo da organização
Armazenada como data URL base64 em `org.settings["logo_url"]` (JSONB) — sem migration necessária. Endpoints em `organizations.py`: `POST /org/logo` e `DELETE /org/logo`. Frontend usa `useSWR("/org", ...)` e acessa `orgData?.settings?.logo_url` para exibir nos PDFs.

---

## Implementações futuras / pendentes

- [ ] Domínio próprio (`https://...`) → adicionar `APP_URL` no Dokploy e habilitar `cookie_secure=True`
- [ ] Camadas adicionais do mapa (pesos, heatmap, clusters por setor) — desligadas, a ativar futuramente
- [ ] Stripe integração completa — chaves configuradas mas fluxo de checkout pode estar incompleto
- [ ] Sentry — DSN não configurado em produção (`sentry_dsn=""`)
- [ ] Migração de storage de WebDAV para Cloudflare R2 (variáveis já existem)

---

## Cores da marca

```
Verde Intelbras: #06CB3F
Verde escuro:    #163134
Azul padrão:     #2563eb  (não usar em e-mails — substituído pelo verde Intelbras)
```

---

## Dark mode — padrões e armadilhas

- `style={{ color: "#163134" }}` em texto → **invisível em dark mode**. Usar `className="text-[#163134] dark:text-foreground"`.
- `dark:bg-*-950` sem opacidade → fundo quase preto. Sempre usar `/30`, ex: `dark:bg-amber-950/30`.
- `<select>` nativo precisa de `text-gray-900` explícito mesmo com `bg-white` — browsers aplicam dark mode no texto nativamente.
- Heatmaps e paletas em dark mode: preferir `emerald` ao invés de `blue` para alinhar com tema Intelbras.

---

## Ferramentas locais

- `ruff` não está no PATH local — usar `python -m ruff format app/` e `python -m ruff check app/`.
- `gh` CLI não instalado — criar PRs pela URL: `https://github.com/DhioneCastilhoBarbosa/painel-financeiro-ev/pull/new/<branch>`.

---

## E-mail — simulador de leads

- `run_simulation` e `run_simulation_multi` já retornam `monthly_projections` (24 meses) — disponível em `sim.get("monthly_projections", [])` no e-mail.
- Gráfico de fluxo de caixa usa `<table>` com `bgcolor`/`height` (sem SVG/canvas) para compatibilidade com Outlook.
- Nunca usar azul (`#2563eb`) nos e-mails — paleta é verde Intelbras: botões `#06CB3F`, cabeçalho `#163134`.
