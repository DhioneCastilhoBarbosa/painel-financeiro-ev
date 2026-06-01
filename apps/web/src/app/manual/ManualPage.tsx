"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, ChevronRight, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";

const GREEN = "#06CB3F";
const DARK  = "#163134";

// ─── TOC Definition ───────────────────────────────────────────────────────────

const TOC = [
  { id: "inicio",       label: "Início Rápido"              },
  { id: "arquitetura",  label: "Arquitetura"                },
  { id: "env",          label: "Variáveis de Ambiente"      },
  { id: "auth",         label: "Autenticação e Permissões"  },
  { id: "dashboard",    label: "Painel Principal (KPIs)"    },
  { id: "receita",      label: "Receita"                    },
  { id: "estacoes",     label: "Estações"                   },
  { id: "usuarios",     label: "Usuários"                   },
  { id: "dre",          label: "DRE"                        },
  { id: "investimento", label: "Análise de Investimento"    },
  { id: "payback",      label: "Payback por Cenários"       },
  { id: "relatorio",    label: "Relatório PDF"              },
  { id: "arquivos",     label: "Arquivos"                   },
  { id: "leads",        label: "CRM de Leads"               },
  { id: "capex",        label: "CAPEX por Carregador"       },
  { id: "equipe",       label: "Equipe"                     },
  { id: "alertas",      label: "Alertas"                    },
  { id: "cobranca",     label: "Plano & Cobrança"           },
  { id: "apis",         label: "Usando as APIs"             },
  { id: "calculos",     label: "Cálculos Detalhados"        },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function H1({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h1
      id={id}
      className="text-3xl font-extrabold tracking-tight mt-14 mb-5 scroll-mt-20 pb-3 border-b"
      style={{ color: DARK, borderColor: `${GREEN}40` }}
    >
      {children}
    </h1>
  );
}

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-xl font-bold mt-8 mb-3 scroll-mt-20"
      style={{ color: DARK }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold mt-5 mb-2" style={{ color: DARK }}>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-600 leading-relaxed mb-3">{children}</p>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-slate-600 mb-1.5">
      <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" style={{ color: GREEN }} />
      <span>{children}</span>
    </li>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="mb-4">{children}</ul>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-sm font-mono bg-slate-100 text-slate-800">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-slate-900 text-green-300 rounded-xl p-4 text-sm font-mono overflow-x-auto mb-4 leading-relaxed">
      {children}
    </pre>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-4 text-sm font-mono leading-loose"
      style={{ backgroundColor: `${DARK}08`, borderLeft: `3px solid ${GREEN}` }}
    >
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-6 rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: `${DARK}08` }}>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-semibold" style={{ color: DARK }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-slate-600 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3 mb-4 text-sm text-slate-600"
      style={{ backgroundColor: `${GREEN}12`, borderLeft: `3px solid ${GREEN}` }}
    >
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 mb-4 text-sm text-amber-700 bg-amber-50 border-l-4 border-amber-400">
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ManualPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeId, setActiveId]     = useState(TOC[0].id);
  const [menuOpen, setMenuOpen]     = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Acesso restrito a usuários Mestre
  useEffect(() => {
    if (!loading && (!user || !user.is_master)) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  // ScrollSpy
  useEffect(() => {
    const ids = TOC.map((t) => t.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the topmost visible section
          const topmost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );

    els.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <nav className="space-y-0.5">
      {TOC.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={
            activeId === item.id
              ? { backgroundColor: `${GREEN}18`, color: GREEN, fontWeight: 600 }
              : { color: "#64748b" }
          }
        >
          {item.label}
        </button>
      ))}
    </nav>
  );

  // Bloqueia render enquanto verifica sessão ou se não é mestre
  if (loading || !user || !user.is_master) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: DARK }}>
        {loading ? (
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${GREEN}60`, borderTopColor: "transparent" }} />
        ) : (
          <div className="text-center">
            <Lock className="h-10 w-10 mx-auto mb-3" style={{ color: GREEN }} />
            <p className="text-white/60 text-sm">Acesso restrito</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Header ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-sm"
        style={{ backgroundColor: `${DARK}f5` }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo height={24} />
            <span className="text-white/40 text-sm hidden sm:inline">/ Manual do Sistema</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block text-sm text-white/60 hover:text-white transition-colors">
              Entrar
            </Link>
            <button
              className="sm:hidden text-white"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile TOC drawer */}
        {menuOpen && (
          <div className="sm:hidden bg-white border-t px-4 py-4 max-h-64 overflow-y-auto">
            <Sidebar />
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-20 pb-24 flex gap-8">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden sm:block w-52 shrink-0">
          <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-3" style={{ color: DARK }}>
              Conteúdo
            </p>
            <Sidebar />
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0">

          {/* Cover */}
          <div
            className="rounded-2xl p-8 mb-10"
            style={{ background: `linear-gradient(135deg, ${DARK} 0%, #0d2427 100%)` }}
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
              style={{ backgroundColor: `${GREEN}25`, color: GREEN }}
            >
              Documentação Técnica
            </div>
            <h1 className="text-3xl font-extrabold text-white mb-2">Manual do Sistema</h1>
            <p className="text-white/60">
              FinanceDash — Plataforma SaaS de Gestão Financeira para Eletropostos
            </p>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              1. INÍCIO RÁPIDO
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="inicio">1. Início Rápido</H1>

          <H2>Pré-requisitos</H2>
          <Ul>
            <Li><strong>Docker Desktop</strong> ≥ 4.x instalado e em execução</Li>
            <Li><strong>Git</strong> para clonar o repositório</Li>
            <Li>Porta <Code>3000</Code> (frontend), <Code>8000</Code> (API), <Code>5433</Code> (banco) e <Code>6380</Code> (Redis) disponíveis</Li>
          </Ul>

          <H2>Subindo pela primeira vez</H2>
          <Pre>{`# 1. Clone o repositório
git clone https://github.com/sua-org/financedash-saas.git
cd financedash-saas

# 2. Crie o arquivo de ambiente (a partir do exemplo)
cp .env.example .env
#    Edite .env: gere SECRET_KEY com:
#    python -c "import secrets; print(secrets.token_hex(32))"

# 3. Suba todos os containers (DB, Redis, API, Worker, Frontend)
docker compose up -d

# 4. Aplique as migrações do banco de dados (apenas na primeira vez)
docker compose exec api alembic upgrade head

# 5. Acesse
#    Frontend:   http://localhost:3000
#    API Docs:   http://localhost:8000/api/docs
#    ReDoc:      http://localhost:8000/api/redoc`}</Pre>

          <Note>
            Na <strong>primeira inicialização</strong> do container <Code>web</Code>, o npm instala as dependências (~40s). Aguarde a mensagem <em>"✓ Ready"</em> nos logs antes de acessar <Code>localhost:3000</Code>. Use <Code>docker compose logs web -f</Code> para acompanhar.
          </Note>

          <H2>Comandos úteis do dia a dia</H2>
          <Pre>{`# Ver status dos containers
docker compose ps

# Acompanhar logs em tempo real
docker compose logs -f api          # logs da API
docker compose logs -f web          # logs do Next.js
docker compose logs -f worker       # logs do Celery

# Parar tudo
docker compose stop

# Reiniciar um serviço específico
docker compose restart api

# Reconstruir imagem após mudanças no requirements.txt
docker compose build api worker && docker compose up -d api worker`}</Pre>


          {/* ════════════════════════════════════════════════════════════════════
              2. ARQUITETURA
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="arquitetura">2. Arquitetura do Sistema</H1>

          <Table
            headers={["Container", "Tecnologia", "Porta (host)", "Função"]}
            rows={[
              ["financedash_web",    "Next.js 16 + Node 20",      "3000", "Frontend SPA/SSR — interface do usuário"],
              ["financedash_api",    "FastAPI + Python 3.12",      "8000", "API REST — lógica de negócio e analytics"],
              ["financedash_worker", "Celery 5",                   "—",    "Processamento assíncrono de arquivos"],
              ["financedash_db",     "TimescaleDB (PostgreSQL 16)", "5433", "Banco de dados relacional + time-series"],
              ["financedash_redis",  "Redis 7",                    "6380", "Broker Celery, sessões e rate-limiting"],
            ]}
          />

          <H2>Fluxo de dados</H2>
          <Pre>{`Browser → Next.js (3000) → [rewrite /api/*] → FastAPI (8000)
                                                  ↓
                                           PostgreSQL (5433)
                                                  ↑
                                      Celery Worker ← Redis (6380)`}</Pre>

          <P>
            O Next.js em desenvolvimento proxia todas as requisições <Code>/api/*</Code> para a API FastAPI via a configuração de <em>rewrites</em> no <Code>next.config.ts</Code>. O <Code>INTERNAL_API_URL=http://api:8000</Code> é usado pelo servidor Next.js para resolver o endereço interno da API dentro da rede Docker.
          </P>

          <H2>Stack tecnológica completa</H2>
          <Table
            headers={["Camada", "Tecnologia"]}
            rows={[
              ["Framework web",        "Next.js 16.2 (App Router, React 19)"],
              ["UI Components",        "shadcn/ui + Tailwind CSS"],
              ["Gráficos",             "Recharts"],
              ["HTTP Client",          "Axios (com interceptor de erro PT-BR)"],
              ["API Framework",        "FastAPI 0.115"],
              ["ORM",                  "SQLAlchemy 2.0 (asyncpg)"],
              ["Migrations",           "Alembic"],
              ["Auth",                 "JWT (PyJWT) + Redis (refresh token)"],
              ["Task Queue",           "Celery 5 + Redis"],
              ["Banco de dados",       "TimescaleDB (PostgreSQL 16 + extensão time-series)"],
              ["Cache/Broker",         "Redis 7"],
              ["E-mail",               "Resend"],
              ["Pagamentos",           "Stripe"],
              ["Monitoramento",        "Sentry"],
              ["Rate limiting",        "slowapi (limita por IP real via X-Forwarded-For)"],
            ]}
          />


          {/* ════════════════════════════════════════════════════════════════════
              3. VARIÁVEIS DE AMBIENTE
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="env">3. Variáveis de Ambiente</H1>

          <P>Todas as variáveis ficam no arquivo <Code>.env</Code> na raiz do repositório (nunca versionar). O arquivo <Code>.env.example</Code> contém os valores padrão para desenvolvimento.</P>

          <Table
            headers={["Variável", "Padrão dev", "Descrição"]}
            rows={[
              ["SECRET_KEY",              "gerada",         "Chave JWT — 64 hex chars. Gere com: python -c \"import secrets; print(secrets.token_hex(32))\""],
              ["DATABASE_URL",            "localhost:5433", "URL asyncpg do PostgreSQL"],
              ["REDIS_URL",               "localhost:6380", "URL do Redis"],
              ["ENVIRONMENT",             "development",    "development | production"],
              ["DEBUG",                   "false",          "Ativa logs SQL e Swagger público"],
              ["ALLOWED_ORIGINS",         "localhost:3000", "CORS — domínios do frontend separados por vírgula"],
              ["APP_URL",                 "localhost:3000", "URL pública do frontend (usada nos links de e-mail)"],
              ["STORAGE_BACKEND",         "local",          "local | s3 (Cloudflare R2 ou Amazon S3)"],
              ["RESEND_API_KEY",          "(vazio)",        "API key do Resend — e-mails ficam em modo no-op sem isso"],
              ["STRIPE_SECRET_KEY",       "(vazio)",        "Chave secreta do Stripe — cobrança fica em modo no-op"],
              ["STRIPE_WEBHOOK_SECRET",   "(vazio)",        "Assinatura do webhook Stripe"],
              ["STRIPE_PRICE_STARTER",    "(vazio)",        "ID do preço Stripe do plano Starter (R$197/mês)"],
              ["STRIPE_PRICE_PRO",        "(vazio)",        "ID do preço Stripe do plano Pro (R$497/mês)"],
              ["SENTRY_DSN",              "(vazio)",        "DSN do Sentry para rastreamento de erros"],
              ["SENTRY_TRACES_SAMPLE_RATE", "0.0",         "Fração de requests com distributed tracing (0.05 em prod)"],
              ["DOCS_ACCESS_TOKEN",       "(vazio)",        "Token para proteger o Swagger UI em produção"],
            ]}
          />

          <Warn>
            Em produção use o <Code>.env.production.example</Code> como guia. Nunca coloque <Code>.env.production</Code> no repositório. Prefira AWS Secrets Manager para injetar as variáveis nas task definitions do ECS.
          </Warn>


          {/* ════════════════════════════════════════════════════════════════════
              4. AUTH & PERMISSÕES
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="auth">4. Autenticação e Permissões</H1>

          <H2>Fluxo de autenticação</H2>
          <Ul>
            <Li><strong>Registro</strong> (<Code>POST /api/v1/auth/register</Code>) — cria organização + usuário owner + subscription trial 14 dias. Envia e-mail de verificação.</Li>
            <Li><strong>Login</strong> (<Code>POST /api/v1/auth/login</Code>) — retorna <Code>access_token</Code> (JWT, 15 min) no corpo e <Code>refresh_token</Code> em cookie HttpOnly (30 dias).</Li>
            <Li><strong>Renovação</strong> (<Code>POST /api/v1/auth/refresh</Code>) — usa o cookie de refresh para emitir novo access token sem re-login. O refresh token é rotacionado a cada uso.</Li>
            <Li><strong>Logout</strong> (<Code>POST /api/v1/auth/logout</Code>) — invalida o refresh token no Redis.</Li>
          </Ul>

          <H2>Papéis (roles) integrados</H2>
          <Table
            headers={["Role", "Nome", "Acesso"]}
            rows={[
              ["owner",    "Proprietário",   "Tudo, incluindo cobrança e exclusão de dados"],
              ["admin",    "Administrador",  "Tudo exceto cobrança. Gerencia equipe e configurações."],
              ["analyst",  "Analista",       "Dashboards, relatórios, arquivos. Sem acesso à equipe."],
              ["viewer",   "Visualizador",   "Somente Visão Geral e Relatório PDF."],
            ]}
          />

          <H2>Cargos customizáveis</H2>
          <P>
            Além dos 4 roles integrados, o owner/admin pode criar <strong>Cargos Customizáveis</strong> (menu Equipe → Cargos) com permissões granulares:
          </P>
          <Table
            headers={["Permissão", "O que libera"]}
            rows={[
              ["view_dashboard",  "Painel principal de KPIs"],
              ["view_stations",   "Painel de estações"],
              ["view_users",      "Painel de usuários"],
              ["view_investment", "Análise de investimento e payback"],
              ["import_files",    "Upload de arquivos CSV/XLSX"],
              ["delete_files",    "Exclusão de arquivos"],
              ["manage_alerts",   "Criar e editar alertas"],
              ["manage_settings", "Configurações de custo"],
              ["manage_team",     "Convidar e remover membros"],
              ["view_billing",    "Ver plano e histórico"],
              ["view_audit",      "Log de auditoria"],
              ["view_leads",      "Ver leads no CRM (lista, detalhe, exportar)"],
              ["manage_leads",    "Configurar simulador e e-mails de notificação de leads"],
            ]}
          />

          <H2>Trial e planos</H2>
          <Ul>
            <Li>Novas organizações têm <strong>14 dias de trial</strong> com acesso completo.</Li>
            <Li>Após o trial, os painéis de analytics, arquivos, leads e CAPEX retornam <Code>HTTP 402</Code> até que um plano seja contratado.</Li>
            <Li>As páginas de auth, equipe, perfil e cobrança permanecem acessíveis mesmo com trial expirado.</Li>
          </Ul>


          {/* ════════════════════════════════════════════════════════════════════
              5. PAINEL PRINCIPAL
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="dashboard">5. Painel Principal (KPIs)</H1>
          <P>Rota: <Code>/dashboard</Code> — acessível por todos os roles.</P>

          <H2>Filtros globais</H2>
          <P>Todos os painéis aceitam os mesmos filtros, aplicados via query params:</P>
          <Table
            headers={["Parâmetro", "Tipo", "Descrição"]}
            rows={[
              ["date_from",  "YYYY-MM-DD", "Data de início (inclusive)"],
              ["date_to",    "YYYY-MM-DD", "Data de fim (inclusive)"],
              ["files",      "string[]",   "IDs de arquivos separados por vírgula"],
              ["stations",   "string[]",   "Nomes de estações (multi-valor)"],
              ["connectors", "string[]",   "Tipos de conector (multi-valor)"],
            ]}
          />

          <H2>KPIs exibidos</H2>
          <Table
            headers={["Indicador", "Descrição"]}
            rows={[
              ["Total de sessões",        "Total de registros no período, independente de pagamento"],
              ["Sessões pagas",           "Sessões com is_paid=true"],
              ["Receita total",           "Soma de revenue_total das sessões pagas"],
              ["Receita pendente",        "Soma de revenue_total das sessões com status 'pending'"],
              ["kWh entregue",            "Soma de energy_kwh de todas as sessões com energia registrada"],
              ["kWh médio/sessão",        "Média de energy_kwh"],
              ["Ticket médio",            "Média de revenue_total das sessões pagas"],
              ["Receita por kWh",         "revenue_energy / energy_kwh (sessões com energia e pagamento)"],
              ["Receita por dia",         "Receita total / dias com dados"],
              ["kWh por dia",             "kWh total / dias com dados"],
              ["Sessões por dia",         "Total de sessões / dias com dados"],
              ["Taxa de conversão",       "Sessões pagas / total de tentativas × 100%"],
              ["Taxa de aprovação",       "Sessões pagas / total de sessões × 100%"],
              ["Taxa de rejeição",        "Sessões rejeitadas / tentativas × 100%"],
              ["Usuários únicos",         "Count de user_tag distintos"],
              ["Clientes únicos",         "Usuários com exatamente 1 sessão no período"],
              ["Power users",             "Usuários com ≥ 5 sessões no período"],
              ["% receita power users",   "Receita de power users / receita total × 100%"],
              ["Receita projetada anual", "Receita total / dias × 365"],
            ]}
          />


          {/* ════════════════════════════════════════════════════════════════════
              6. RECEITA
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="receita">6. Receita (Série Temporal)</H1>
          <P>Rota: <Code>/dashboard/timeseries</Code> — analista, admin, owner.</P>
          <P>
            Exibe a evolução de receita, sessões e kWh ao longo do tempo. A granularidade pode ser <strong>diária</strong>, <strong>semanal</strong> ou <strong>mensal</strong>.
          </P>
          <Table
            headers={["Granularidade", "Agrupamento"]}
            rows={[
              ["Diária",   "Por data (YYYY-MM-DD)"],
              ["Semanal",  "Por início de semana ISO"],
              ["Mensal",   "Por mês (YYYY-MM)"],
            ]}
          />
          <P>Cada ponto da série inclui: <Code>date</Code>, <Code>revenue</Code> (R$), <Code>sessions</Code> (contagem), <Code>kwh</Code> (kWh entregue).</P>


          {/* ════════════════════════════════════════════════════════════════════
              7. ESTAÇÕES
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="estacoes">7. Estações</H1>
          <P>Rota: <Code>/dashboard/stations</Code> — analista, admin, owner.</P>

          <H2>Ranking de estações</H2>
          <P>Lista as <Code>top_n</Code> estações (padrão 15, máx 50) por receita, mostrando também sessões, sessões/dia e kWh.</P>

          <H2>Taxa de ocupação</H2>
          <P>
            Calculada como: <Code>minutos_carregados / (operating_hours × 60 × dias) × 100%</Code>.
            O parâmetro <Code>operating_hours</Code> (padrão 24h, configurável para 8h, 12h etc.) representa o horário de funcionamento da estação.
          </P>

          <H2>Detalhamento individual</H2>
          <P>
            Ao clicar em uma estação, a rota <Code>/api/v1/analytics/stations/{"{nome}"}/detail</Code> retorna série diária, top 10 usuários e breakdown por conector para aquela estação específica.
          </P>


          {/* ════════════════════════════════════════════════════════════════════
              8. USUÁRIOS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="usuarios">8. Usuários</H1>
          <P>Rota: <Code>/dashboard/usuarios</Code> — analista, admin, owner.</P>
          <P>Painéis de segmentação e retenção de usuários de recarga.</P>

          <H2>Segmentação básica</H2>
          <Table
            headers={["Segmento", "Critério"]}
            rows={[
              ["Únicos",        "Usuários com pelo menos 1 sessão no período"],
              ["Clientes",      "1 sessão exata no período (first-time)"],
              ["Recorrentes",   "2–4 sessões no período"],
              ["Power users",   "≥ 5 sessões no período"],
            ]}
          />

          <H2>Análise de coorte</H2>
          <P>
            Rota: <Code>/api/v1/analytics/cohort</Code>. Agrupa usuários pelo mês da primeira sessão e mostra a porcentagem que voltou a usar nos meses seguintes. Útil para medir retenção e fidelização.
          </P>

          <H2>Análise profunda (RFM simplificado)</H2>
          <P>
            Rota: <Code>/api/v1/analytics/users-deep</Code>. Calcula <strong>Recência</strong> (dias desde última sessão), <strong>Frequência</strong> (total de sessões) e <strong>LTV</strong> (receita total) por usuário.
          </P>


          {/* ════════════════════════════════════════════════════════════════════
              9. DRE
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="dre">9. DRE — Demonstração do Resultado</H1>
          <P>Rota: <Code>/dashboard/dre</Code> — analista, admin, owner.</P>
          <P>
            O DRE é calculado automaticamente a partir das sessões importadas e das <strong>Configurações de Custo</strong> definidas em <Code>/dashboard/settings</Code>.
          </P>

          <H2>Parâmetros de custo (configuráveis)</H2>
          <Table
            headers={["Parâmetro", "Padrão", "Descrição"]}
            rows={[
              ["energy_cost_per_kwh",     "R$ 0,75/kWh",  "Custo de energia elétrica pago pelo operador"],
              ["operational_cost_pct",    "5%",            "% da receita líquida para custos operacionais"],
              ["platform_fee_pct",        "3%",            "Taxa percentual da plataforma de pagamento"],
              ["platform_fixed_monthly",  "R$ 0,00",       "Taxa fixa mensal da plataforma (proporcional ao período)"],
              ["tax_pct",                 "6%",            "Alíquota de impostos sobre a receita líquida"],
              ["revenue_split_pct",       "0%",            "Divisão de receita com parceiros/locadores"],
              ["maintenance_monthly",     "R$ 0,00",       "Custo fixo mensal de manutenção dos equipamentos"],
              ["depreciation_years",      "5 anos",        "Usado na calculadora de payback, não no DRE"],
            ]}
          />

          <H2>Fórmulas do DRE</H2>
          <Formula>{`Receita Bruta      = Σ revenue_total  (sessões pagas no período)
Desconto Voucher   = Σ revenue_total  (sessões com has_voucher=true)
Receita Líquida    = Receita Bruta − Desconto Voucher

Custo de Energia   = Σ energy_kwh × energy_cost_per_kwh
Custo Operacional  = Receita Líquida × operational_cost_pct
Taxa Plataforma %  = Receita Líquida × platform_fee_pct
Taxa Plataforma $  = platform_fixed_monthly × (dias_período / 30)
Impostos           = Receita Líquida × tax_pct
Divisão Receita    = Receita Líquida × revenue_split_pct
Manutenção         = maintenance_monthly × (dias_período / 30)

Total Custos       = Σ todos os custos acima

EBITDA             = Receita Líquida − Total Custos
Margem EBITDA      = EBITDA / Receita Líquida × 100%

Lucro Líquido      = EBITDA   (depreciação calculada no Payback)
Margem Líquida     = Lucro Líquido / Receita Líquida × 100%`}</Formula>


          {/* ════════════════════════════════════════════════════════════════════
              10. ANÁLISE DE INVESTIMENTO
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="investimento">10. Análise de Investimento</H1>
          <P>Rota: <Code>/dashboard/investimento</Code> — analista, admin, owner.</P>
          <P>
            Calculadora interativa completa que projeta mês a mês o retorno do investimento em carregadores EV.
            Todos os cálculos são feitos no frontend (<Code>investimentoCalc.ts</Code>) via <Code>computeProject()</Code> — sem roundtrip de API.
          </P>

          <H2>Entradas: CAPEX</H2>
          <Table
            headers={["Campo", "Padrão", "Descrição"]}
            rows={[
              ["Carregadores (R$)",          "40.000",  "Valor total dos equipamentos de carga"],
              ["Infraestrutura elétrica (R$)","15.000",  "Painéis, cabos, infraestrutura elétrica"],
              ["Obra civil (R$)",             "8.000",   "Construção ou adequação do espaço"],
              ["Transformador (R$)",          "5.000",   "Transformador de energia (se necessário)"],
              ["Proteção elétrica (R$)",      "2.000",   "Disjuntores, DPS, aterramento"],
              ["Homologação (R$)",            "2.000",   "Taxas de homologação e certificação"],
              ["Software/backend (R$)",       "3.000",   "Licenças de software e plataforma OCPP"],
              ["Instalação (R$)",             "5.000",   "Mão de obra de instalação"],
              ["Outros (R$)",                 "0",       "Demais custos de implantação"],
              ["Anos de depreciação",         "10",      "Prazo de depreciação linear do CAPEX"],
              ["Depreciação como caixa",      "Sim",     "true = provisão para reposição (reduz FCF); false = apenas efeito fiscal"],
            ]}
          />

          <H2>Entradas: Receita</H2>
          <Table
            headers={["Campo", "Padrão", "Descrição"]}
            rows={[
              ["Tarifa (R$/kWh)",          "2,50",  "Preço cobrado ao usuário por kWh carregado"],
              ["Taxa de início (R$/sessão)","0,00",  "Cobrança fixa por sessão iniciada"],
              ["kWh médio/mês (100% occ.)", "4.000", "Energia mensal a 100% de ocupação"],
              ["Ocupação inicial (%)",      "20%",   "Ocupação no mês 1"],
              ["Ocupação alvo 12 meses (%)", "60%",  "Ocupação ao fim da rampa de 12 meses"],
              ["Crescimento após mês 12",   "2%/mês","Taxa de crescimento mensal composto (÷4 na fórmula)"],
              ["Sessões/dia (100% occ.)",   "12",    "Volume de sessões a 100% de utilização"],
            ]}
          />

          <H2>Entradas: OPEX Mensal</H2>
          <Table
            headers={["Campo", "Padrão", "Descrição"]}
            rows={[
              ["Tarifa de energia (R$/kWh)", "0,75",  "Custo pago à concessionária"],
              ["Demanda elétrica (R$/mês)",  "300",   "Tarifa fixa de demanda contratada"],
              ["Internet (R$/mês)",          "100",   "Conectividade dos carregadores"],
              ["Backend/plataforma (R$/mês)","150",   "Mensalidade da plataforma OCPP/gestão"],
              ["Manutenção preventiva",       "200",   "Revisões periódicas programadas"],
              ["Manutenção corretiva",        "100",   "Reparos eventuais"],
              ["Aluguel (R$/mês)",            "0",     "Aluguel do espaço (0 = espaço próprio)"],
              ["Seguro (R$/mês)",             "100",   "Seguro dos equipamentos"],
              ["Gateway (%)",                 "2,5%",  "Taxa percentual da processadora de pagamentos"],
              ["Inadimplência (%)",           "1%",    "Estimativa de perdas por chargeback/não-pagamento"],
              ["Custos adm. (R$/mês)",        "200",   "Despesas administrativas diversas"],
            ]}
          />

          <H2>Entradas: Split de Receita, Impostos e Financiamento</H2>
          <Table
            headers={["Campo", "Padrão", "Descrição"]}
            rows={[
              ["Split de receita (%)",    "0%",      "% cedida ao dono do estabelecimento/parceiro"],
              ["Base do split",           "Receita", "Base de cálculo: Receita | EBITDA | Lucro"],
              ["Alíquota de impostos (%)", "0%",     "Alíquota efetiva — configure por regime tributário"],
              ["Base dos impostos",       "Lucro",   "Simples Nacional = Receita; LP/LR = Lucro (EBIT)"],
              ["Taxa de desconto (%/ano)", "12%",    "Custo de oportunidade do capital para VPL"],
              ["Horizonte (anos)",         "5",      "Prazo total da projeção"],
              ["Parcelas CAPEX",           "1x",     "Número de parcelas (1–10x). Modo “separado” permite prazos distintos para carregadores vs. demais itens."],
              ["Juros financiamento (%/mês)","0%",   "Taxa mensal aplicada ao financiamento do CAPEX"],
            ]}
          />

          <H2>Fórmulas — CAPEX e Depreciação</H2>
          <Formula>{`CAPEX total = carregadores + infra_elétrica + obra_civil + transformador
           + proteção_elétrica + homologação + software_backend
           + instalação + outros_capex

Depreciação mensal = CAPEX / (anos_depreciação × 12)

── Parcelas (PMT) ────────────────────────────────────────────
Sem juros (r = 0):  parcela = CAPEX / N
Com juros:          parcela = CAPEX × r / (1 − (1 + r)^(−N))

Modo "separado": carregadores e demais custos têm N e r independentes`}</Formula>

          <H2>Fórmulas — Rampa de Ocupação</H2>
          <Formula>{`Meses 1–12 (rampa linear):
  occ(t) = occ_inicial + (occ_alvo_12m − occ_inicial) × (t / 12)

Meses 13–N (crescimento suave):
  occ(t) = min(100%, occ_alvo_12m × (1 + crescimento%/4/100 × (t − 12)))`}</Formula>

          <H2>Fórmulas — P&L Mensal</H2>
          <Formula>{`kWh(t)          = avg_monthly_kwh × (occ(t) / 100)
Receita kWh     = tarifa_por_kwh × kWh(t)
Sessões mensais = sessões_por_dia × 30 × (occ(t) / 100)
Receita sessão  = taxa_início × sessões_mensais
Receita(t)      = Receita kWh + Receita sessão

── OPEX ────────────────────────────────────────────────────────
Energia         = tarifa_energia × kWh(t) + demanda_fixa
Gateway         = Receita(t) × gateway%
Inadimplência   = Receita(t) × inadimplência%
OPEX_fixo       = internet + backend + manutenção_prev + manutenção_corr
                + aluguel + seguro + custos_adm + outros_opex
OPEX_base       = Energia + Gateway + Inadimplência + OPEX_fixo

── Revenue Split (calculado sobre base pré-split) ─────────────
EBITDA_pré      = Receita − OPEX_base
EBIT_pré        = EBITDA_pré − Depreciação
split_amount    = base = "revenue"  → Receita × split%
                  base = "ebitda"   → max(0, EBITDA_pré) × split%
                  base = "profit"   → max(0, EBIT_pré) × split%
OPEX_total      = OPEX_base + split_amount

── DRE ─────────────────────────────────────────────────────────
EBITDA          = Receita − OPEX_total
EBIT            = EBITDA − Depreciação

Impostos (Simples/Receita):        = Receita × alíquota%
Impostos (Lucro Presumido/Real):   = max(0, EBIT) × alíquota%

FCF (depr. como caixa/provisão):   = EBIT − Impostos
FCF (depr. não-caixa):             = EBITDA − Impostos`}</Formula>

          <H2>Fórmulas — Indicadores Financeiros</H2>
          <Formula>{`Fluxo líquido(t) = FCF(t) − parcela_capex(t)

Payback simples:    menor t onde Σ Fluxo_líquido(0..t) ≥ 0
Payback descontado: menor t onde Σ Fluxo_líquido(t) / (1+r_mensal)^t ≥ 0

Taxa mensal:  r_m = (1 + taxa_desconto_anual/100)^(1/12) − 1
VPL:          Σ Fluxo_líquido(t) / (1 + r_m)^t   [t = 0..N]
TIR:          taxa r onde VPL = 0  (método bisseção; convertida para a.a.)
              TIR_anual = (1 + TIR_mensal)^12 − 1

ROI (%):      Σ Fluxo_líquido / CAPEX × 100
ROI anual:    ROI / anos_horizonte`}</Formula>

          <H2>Métricas unitárias calculadas</H2>
          <Table
            headers={["Indicador", "Fórmula"]}
            rows={[
              ["CAPEX por carregador",       "CAPEX / n_carregadores"],
              ["CAPEX por kW",               "CAPEX / (n_carregadores × power_kw)"],
              ["CAPEX por conector",         "CAPEX / (n_carregadores × n_conectores)"],
              ["Receita mensal por kW",      "(Receita_Ano1 / 12) / kW_total"],
              ["Receita mensal por conector","(Receita_Ano1 / 12) / conectores_total"],
              ["Receita por usuário",        "(Receita_Ano1 / 12) / n_usuários"],
              ["Lucro por kWh",              "FCF_médio_mensal / kWh_médio_mensal"],
              ["OPEX por kWh",               "OPEX_médio_mensal / kWh_médio_mensal"],
            ]}
          />

          <H2>Análise de Sensibilidade (±20%)</H2>
          <P>Para cada variável, o payback é recalculado com a variável multiplicada por 1,20 (cenário adverso) e 0,80 (cenário favorável). O resultado mostra quantos meses o payback muda em relação ao cenário base.</P>
          <Table
            headers={["Variável testada", "Cenário adverso (+20%)", "Cenário favorável (−20%)"]}
            rows={[
              ["Tarifa de energia",  "Custo de energia sobe 20%",  "Custo de energia cai 20%"],
              ["Ocupação",           "Ocupação cai 20%",           "Ocupação sobe 20%"],
              ["Tarifa cobrada",     "Tarifa ao usuário cai 20%",  "Tarifa ao usuário sobe 20%"],
              ["CAPEX",              "Investimento sobe 20%",      "Investimento cai 20%"],
              ["Taxa gateway",       "Taxa da processadora sobe 20%","Taxa da processadora cai 20%"],
              ["Demanda elétrica",   "Custo de demanda sobe 20%",  "Custo de demanda cai 20%"],
            ]}
          />
          <Note>A sensibilidade é ordenada automaticamente pelo maior impacto absoluto no payback — o topo da lista é o risco mais crítico do projeto.</Note>

          <H2>Insights automáticos</H2>
          <Table
            headers={["Condição", "Severidade", "Insight gerado"]}
            rows={[
              ["Payback ≤ 24 meses",         "success", "Payback excelente (ref. setor: 36–60 meses)"],
              ["24 < Payback ≤ 48 meses",    "info",    "Payback moderado, dentro do aceitável"],
              ["Payback > 48 meses",          "warning", "Payback elevado — revisar CAPEX ou tarifa"],
              ["Sem payback no horizonte",    "error",   "Projeto não recupera o investimento"],
              ["VPL > 0",                     "success", "Projeto viável acima do custo de capital"],
              ["VPL < 0",                     "error",   "Projeto não cobre o custo de capital"],
              ["TIR > taxa_desconto + 10pp",  "success", "TIR excelente — projeto altamente atrativo"],
              ["Energia > 55% do OPEX",       "warning", "Alta concentração em energia — risco de tarifa"],
              ["Ocupação inicial < 30%",      "warning", "Período longo de maturação — planejar aquisição"],
              ["CAPEX > 5× receita Ano 1",    "warning", "CAPEX muito elevado vs. receita projetada"],
              ["FCF Ano 1 < 0",               "warning", "Reserve capital de giro para o 1º ano"],
              ["Margem líquida > 30%",        "success", "Estrutura de custos eficiente"],
            ]}
          />


          {/* ════════════════════════════════════════════════════════════════════
              11. PAYBACK POR CENÁRIOS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="payback">11. Payback por Cenários de Ocupação</H1>
          <P>Rota: <Code>/dashboard/payback</Code> — analista, admin, owner.</P>
          <P>
            Exibe o resultado do cálculo de payback particionado em <strong>quatro cenários fixos de ocupação</strong>
            (10%, 20%, 40%, 60%), permitindo comparar rapidamente o impacto da taxa de utilização dos carregadores nos indicadores financeiros.
          </P>

          <H2>Cenários calculados</H2>
          <Table
            headers={["Cenário", "Ocupação fixa", "Interpretação"]}
            rows={[
              ["Pessimista",   "10%",  "Operação com utilização muito baixa — início ou localização desfavorável"],
              ["Conservador",  "20%",  "Ocupação realista para o 1º ano de operação de carregadores AC/DC"],
              ["Base",         "40%",  "Meta típica de operação madura em locais com bom fluxo de veículos EV"],
              ["Otimista",     "60%",  "Alta utilização — hubs de recarga em rodovias ou frotas cativos"],
            ]}
          />
          <Note>
            Em cada cenário, a ocupação é mantida <strong>constante</strong> (sem rampa).
            Isso isola o efeito puro da taxa de ocupação, diferente do modo padrão da Análise de Investimento que usa a rampa configurável.
          </Note>

          <H2>Indicadores por cenário</H2>
          <Table
            headers={["Indicador", "Descrição"]}
            rows={[
              ["Payback (meses)",  "Meses para recuperar o CAPEX com a ocupação fixa"],
              ["VPL (R$)",         "Valor presente líquido ao final do horizonte"],
              ["TIR (%/ano)",      "Taxa interna de retorno anualizada"],
              ["Receita anual",    "Receita total projetada para o 1º ano de operação"],
              ["Lucro anual",      "Fluxo de caixa líquido do 1º ano (FCF − parcelas CAPEX)"],
            ]}
          />

          <H2>Endpoint de backend</H2>
          <Pre>{`# Calcular cenários de payback
GET /api/v1/payback/scenarios
  Authorization: Bearer $TOKEN
  Query params: (mesmos filtros globais — date_from, date_to, files, stations)

# Resposta
{
  "scenarios": [
    {
      "occupancy_pct": 10,
      "payback_months": 74,
      "npv": -45000.00,
      "irr_annual_pct": null,
      "annual_revenue": 120000.00,
      "annual_profit": -8000.00
    },
    { "occupancy_pct": 20, ... },
    { "occupancy_pct": 40, ... },
    { "occupancy_pct": 60, ... }
  ]
}`}</Pre>


          {/* ════════════════════════════════════════════════════════════════════
              12. RELATÓRIO PDF
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="relatorio">12. Relatório PDF</H1>
          <P>Rota: <Code>/dashboard/relatorio</Code> — viewer, analista, admin, owner.</P>
          <P>
            Gera um relatório executivo com os KPIs principais, gráficos de receita e ranking de estações, exportável em PDF. Utiliza <strong>ReportLab</strong> no backend para composição do documento.
          </P>
          <Note>A geração de PDF é processada na API — pode levar alguns segundos para conjuntos de dados grandes.</Note>


          {/* ════════════════════════════════════════════════════════════════════
              12. ARQUIVOS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="arquivos">13. Arquivos</H1>
          <P>Rota: <Code>/dashboard/files</Code> — owner e admin.</P>

          <H2>Upload de dados</H2>
          <Ul>
            <Li>Formatos aceitos: <Code>.xlsx</Code> e <Code>.xls</Code> (Excel)</Li>
            <Li>Tamanho máximo: <strong>50 MB</strong> por arquivo</Li>
            <Li>Limite por plano: Trial/Starter = 5 arquivos · Pro = 30 arquivos</Li>
          </Ul>

          <H2>Fluxo de processamento</H2>
          <Pre>{`Upload → API (salva no storage) → Celery Worker (processa)
         ↓
   status: pending → processing → done | error

O Celery Worker:
  1. Lê o arquivo do storage (local ou S3/R2)
  2. Normaliza as colunas via file_processor.py
  3. Insere as sessões em charging_sessions (TimescaleDB)
  4. Atualiza o DataFile com row_count, date_min, date_max, stations`}</Pre>

          <H2>Colunas esperadas no Excel</H2>
          <P>O processador aceita os formatos de exportação das principais plataformas de gerenciamento de carregadores. As colunas são normalizadas automaticamente por nome (case-insensitive).</P>
          <Table
            headers={["Campo interno", "Exemplos de nome no Excel"]}
            rows={[
              ["started_at",      "Data Início, Start Date, Data/Hora Início"],
              ["station_name",    "Estação, Station, Nome do Ponto"],
              ["connector_type",  "Conector, Connector Type, Tipo"],
              ["user_tag",        "Usuário, User Tag, RFID"],
              ["revenue_total",   "Receita, Total, Valor (R$)"],
              ["energy_kwh",      "kWh, Energia, Energy"],
              ["payment_status",  "Status, Payment Status"],
            ]}
          />

          <H2>Datasets de exemplo</H2>
          <P>O sistema inclui 5 datasets pré-carregados para demonstração, acessíveis via <Code>GET /api/v1/files/examples</Code> e carregáveis com um clique na interface.</P>


          {/* ════════════════════════════════════════════════════════════════════
              13. CRM DE LEADS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="leads">14. CRM de Leads</H1>
          <P>Rota: <Code>/dashboard/leads</Code> — controlado por permissões granulares <Code>view_leads</Code> e <Code>manage_leads</Code> (não por role).</P>
          <P>
            Captura leads gerados pelo simulador público da landing page (<Code>financedash.com.br</Code>). Cada preenchimento do formulário cria automaticamente um lead com os dados do interessado e o resultado da simulação.
          </P>

          <H2>Abas do CRM</H2>
          <Table
            headers={["Aba", "Permissão necessária", "Conteúdo"]}
            rows={[
              ["Leads",          "view_leads",   "Lista com filtros por estado, setor e carregador. Detalhe com dados do contato, simulação e mensagens."],
              ["Análise",        "view_leads",   "Dashboard com KPIs, tendência diária, ranking de estados, carregadores mais desejados, nichos e cidades."],
              ["Configurações",  "manage_leads", "Parâmetros do simulador (preço kWh, OPEX, crescimento, VPL) e e-mails de notificação por estado."],
            ]}
          />

          <H2>Exportação</H2>
          <P>
            O botão <strong>Exportar CSV</strong> chama <Code>GET /api/v1/leads/export</Code> e gera um arquivo com todos os leads: dados do contato, simulação (receita, payback, ROI, VPL) e ambas as mensagens (formulário + especialista).
          </P>

          <H2>Contatos Enterprise</H2>
          <P>
            O formulário "Falar com Vendas" da página <Code>/solucao</Code> cria leads com <Code>sector=Dashboard Financeiro</Code> e <Code>charger_type=Plano Enterprise</Code>, distinguíveis no CRM pelo filtro de setor.
          </P>


          {/* ════════════════════════════════════════════════════════════════════
              14. CAPEX
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="capex">15. CAPEX por Carregador</H1>
          <P>Rota: <Code>/dashboard/capex</Code> — analista, admin, owner.</P>
          <P>
            Registra o investimento real por carregador ou grupo e acompanha o payback com base nos dados de sessão importados.
          </P>

          <H2>Campos do registro</H2>
          <Table
            headers={["Campo", "Obrigatório", "Descrição"]}
            rows={[
              ["Nome",                  "Sim", "Identificação amigável (ex: Estação Shopping A — DC 60kW)"],
              ["Tipo de carregador",    "Não", "Ex: DC 60 kW"],
              ["Nº de pontos",          "Não", "Quantidade de conectores neste grupo"],
              ["CAPEX (R$)",            "Sim", "Investimento total (equipamento + instalação)"],
              ["OPEX (%)",              "Sim", "% da receita para custos operacionais"],
              ["Impostos (%)",          "Sim", "Alíquota de impostos sobre a receita"],
              ["Data de início",        "Sim", "Quando o carregador entrou em operação"],
              ["Vincular a estação",    "Não", "Nome exato da estação nos CSVs importados — habilita dados reais"],
              ["Receita estimada/mês",  "Não", "Fallback quando não há estação vinculada"],
            ]}
          />

          <H2>Cálculo de performance</H2>
          <Formula>{`── Com estação vinculada (dados reais) ──────────────────────
Receita acumulada = Σ revenue_total
                    WHERE station_name = station_key
                    AND started_at >= data_instalação

Receita mensal avg = Σ revenue_total (últimos 90 dias) / 3

── Sem estação vinculada (estimativa) ──────────────────────
Receita acumulada = receita_mensal_est × meses_em_operação

── Métricas (ambos os casos) ───────────────────────────────
OPEX acumulado    = receita_acumulada × opex_pct
Impostos acumulados = receita_acumulada × tax_pct
Lucro líquido     = receita − OPEX − impostos
Posição cumulativa = lucro_líquido − CAPEX
  (negativo = ainda em payback | positivo = CAPEX recuperado)

Payback estimado  = CAPEX / (receita_mensal_avg × (1 − opex_pct − tax_pct))
Progresso (%)     = min(100%, lucro_líquido / CAPEX × 100)`}</Formula>


          {/* ════════════════════════════════════════════════════════════════════
              15. EQUIPE
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="equipe">16. Equipe</H1>
          <P>Rota: <Code>/dashboard/team</Code> — owner e admin.</P>

          <H2>Gerenciamento de membros</H2>
          <Ul>
            <Li>Convidar novo membro por e-mail com role pré-definido (owner, admin, analista, viewer ou cargo customizado)</Li>
            <Li>Alterar role de membros existentes</Li>
            <Li>Desativar ou remover membros</Li>
            <Li>Ver data do último login e status de verificação de e-mail</Li>
          </Ul>

          <H2>Cargos customizáveis</H2>
          <P>
            Na aba <strong>Cargos</strong>, crie templates de permissões reutilizáveis. Um cargo customizado sobrepõe o role integrado — se um membro com role "analista" tiver um cargo customizado com <Code>manage_alerts=true</Code>, ele poderá criar alertas mesmo que analistas não possam por padrão.
          </P>

          <H2>Log de auditoria</H2>
          <P>
            Rota: <Code>/dashboard/audit</Code> (owner/admin). Registra todas as ações sensíveis: upload de arquivo, exclusão, convite enviado, mudança de role, login, etc.
          </P>


          {/* ════════════════════════════════════════════════════════════════════
              16. ALERTAS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="alertas">17. Alertas</H1>
          <P>Rota: <Code>/dashboard</Code> → seção Alertas — permissão <Code>manage_alerts</Code>.</P>

          <H2>Como funciona</H2>
          <Ul>
            <Li>Alertas são avaliados <strong>diariamente às 06h (horário de Brasília)</strong> via Celery Beat, comparando os dados do dia anterior com os thresholds configurados.</Li>
            <Li>Quando um alerta dispara, o criador do alerta recebe um e-mail com a métrica, o threshold e o valor observado.</Li>
            <Li><strong>Cooldown de 24h</strong>: um alerta não dispara novamente dentro de 24 horas para evitar spam de e-mail.</Li>
          </Ul>

          <H2>Métricas disponíveis</H2>
          <Table
            headers={["Métrica", "Descrição"]}
            rows={[
              ["revenue_day",     "Receita total do dia (R$)"],
              ["revenue_session", "Ticket médio por sessão (R$)"],
              ["sessions_day",    "Total de sessões no dia"],
              ["occupancy_pct",   "% de ocupação média das estações"],
            ]}
          />

          <H2>Operadores</H2>
          <Table
            headers={["Operador", "Dispara quando"]}
            rows={[
              ["above", "Valor observado > threshold"],
              ["below", "Valor observado < threshold"],
            ]}
          />


          {/* ════════════════════════════════════════════════════════════════════
              17. COBRANÇA
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="cobranca">18. Plano & Cobrança</H1>
          <P>Rota: <Code>/dashboard/billing</Code> — apenas owner.</P>

          <Table
            headers={["Plano", "Preço", "Usuários", "Arquivos", "Diferenciais"]}
            rows={[
              ["Trial",      "Grátis (14 dias)", "Ilimitado", "Ilimitado", "Acesso completo por 14 dias"],
              ["Starter",    "R$ 197/mês",       "3",         "5",         "Dashboards + CSV export + suporte e-mail"],
              ["Pro",        "R$ 497/mês",       "10",        "30",        "Tudo do Starter + CSV+PDF + payback avançado + cargos customizáveis + suporte prioritário"],
              ["Enterprise", "Sob consulta",     "Ilimitado", "Ilimitado", "CRM para clientes + API + SLA + onboarding + white-label"],
            ]}
          />

          <P>
            A cobrança é gerenciada pelo <strong>Stripe</strong>. O botão <em>Gerenciar assinatura</em> abre o Portal do Cliente Stripe onde é possível alterar dados de cartão, ver histórico de faturas e cancelar.
          </P>
          <P>
            Ao cancelar, a organização passa para o plano <Code>free</Code> e o acesso aos painéis de analytics é bloqueado.
          </P>


          {/* ════════════════════════════════════════════════════════════════════
              18. APIS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="apis">19. Usando as APIs</H1>

          <H2>Documentação interativa</H2>
          <Ul>
            <Li><strong>Swagger UI</strong>: <Code>http://localhost:8000/api/docs</Code> — interface interativa com formulários e botão Authorize</Li>
            <Li><strong>ReDoc</strong>: <Code>http://localhost:8000/api/redoc</Code> — documentação de referência legível</Li>
            <Li><strong>OpenAPI JSON</strong>: <Code>http://localhost:8000/api/openapi.json</Code> — para importar no Postman/Insomnia</Li>
          </Ul>

          <Note>
            Em produção, defina <Code>DOCS_ACCESS_TOKEN=seu-token-secreto</Code> no <Code>.env.production</Code>. O Swagger passará a exigir <Code>?token=seu-token-secreto</Code> na URL.
          </Note>

          <H2>Autenticação nas requisições</H2>
          <Pre>{`# 1. Obter access token
curl -X POST http://localhost:8000/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@empresa.com","password":"SuaSenha123!"}' \\
  -c cookies.txt   # salva o refresh token em cookie

# Resposta:
# { "access_token": "eyJhbGci...", "token_type": "bearer" }

# 2. Usar o token nas requisições
TOKEN="eyJhbGci..."
curl http://localhost:8000/api/v1/auth/me \\
  -H "Authorization: Bearer $TOKEN"

# 3. Renovar o token (usa o cookie de refresh)
curl -X POST http://localhost:8000/api/v1/auth/refresh \\
  -b cookies.txt -c cookies.txt`}</Pre>

          <H2>Exemplos de endpoints analíticos</H2>
          <Pre>{`# KPIs do período
curl "http://localhost:8000/api/v1/analytics/kpis\\
?date_from=2025-01-01&date_to=2025-03-31" \\
  -H "Authorization: Bearer $TOKEN"

# DRE mensal
curl "http://localhost:8000/api/v1/analytics/dre?granularity=monthly" \\
  -H "Authorization: Bearer $TOKEN"

# Ranking de estações (top 10)
curl "http://localhost:8000/api/v1/analytics/stations?top_n=10" \\
  -H "Authorization: Bearer $TOKEN"

# Série temporal diária com filtro de estação
curl "http://localhost:8000/api/v1/analytics/timeseries\\
?granularity=daily&stations=Estacao+Shopping+A" \\
  -H "Authorization: Bearer $TOKEN"

# Simulador público (sem auth)
curl -X POST http://localhost:8000/api/v1/public/simulate \\
  -H "Content-Type: application/json" \\
  -d '{
    "name":"João","cnpj":"12.345.678/0001-90",
    "email":"joao@empresa.com","phone":"(11) 99999-9999",
    "state":"SP","city":"São Paulo",
    "charger_type":"DC 60 kW","sector":"Shopping Center / Mall",
    "position":"Proprietário / Sócio","num_chargers":2
  }'`}</Pre>

          <H2>Upload de arquivo via API</H2>
          <Pre>{`curl -X POST http://localhost:8000/api/v1/files \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@./dados_sessoes.xlsx"

# Monitorar processamento
FILE_ID="uuid-do-arquivo"
curl "http://localhost:8000/api/v1/files/$FILE_ID" \\
  -H "Authorization: Bearer $TOKEN"
# status: pending → processing → done | error`}</Pre>

          <H2>Importar no Postman / Insomnia</H2>
          <Ul>
            <Li>Faça download de <Code>http://localhost:8000/api/openapi.json</Code></Li>
            <Li>No Postman: <em>Import → OpenAPI</em> → cole o JSON ou URL</Li>
            <Li>No Insomnia: <em>Import → From URL</em> → <Code>http://localhost:8000/api/openapi.json</Code></Li>
            <Li>Configure a variável de coleção <Code>baseUrl = http://localhost:8000</Code> e <Code>token = &lt;seu access token&gt;</Code></Li>
          </Ul>

          <H2>Rate limiting</H2>
          <Table
            headers={["Endpoint", "Limite"]}
            rows={[
              ["POST /auth/register",       "5 req/min por IP"],
              ["POST /auth/login",          "10 req/min por IP"],
              ["POST /auth/forgot-password","3 req/min por IP"],
              ["GET  /public/config",       "60 req/min por IP"],
              ["POST /public/simulate",     "10 req/min · 50 req/hora por IP"],
              ["POST /public/enterprise-contact", "5 req/min · 20 req/hora por IP"],
              ["POST /public/leads/{id}/specialist-message", "5 req/min · 20 req/hora por IP"],
            ]}
          />


          {/* ════════════════════════════════════════════════════════════════════
              19. CÁLCULOS DETALHADOS
          ════════════════════════════════════════════════════════════════════ */}
          <H1 id="calculos">20. Cálculos Detalhados</H1>

          <H2>Heatmap hora × dia</H2>
          <P>
            Rota: <Code>/api/v1/analytics/heatmap</Code>. Retorna uma matriz 7 (dias da semana) × 24 (horas) com o volume de sessões em cada célula. Útil para identificar horários de pico.
          </P>

          <H2>Forecast de receita</H2>
          <Formula>{`Dados: série diária de receita (revenue_day_1..N)
x_i = índice do dia (0, 1, 2, ..., N-1)

Regressão linear: y = a×x + b
  (a, b) = numpy.polyfit(x, revenues, 1)

R² = 1 − Σ(y_real − y_pred)² / Σ(y_real − ȳ)²

Previsão para horizonte h (dias futuros):
  x_h = N − 1 + h
  ŷ_h = max(0, a×x_h + b)

Intervalo de confiança 95% (aprox.):
  σ = std(y_real − y_pred)
  margem_h = 1.96 × σ × √(1 + h/N)
  lower = max(0, ŷ_h − margem_h)
  upper = ŷ_h + margem_h`}</Formula>

          <H2>Análise de churn de estações</H2>
          <Formula>{`Para cada estação:
  sessões_recentes = sessões nos últimos 30 dias
  sessões_anteriores = sessões nos 30 dias anteriores

  variação = (recentes − anteriores) / anteriores × 100%

Estação em "churn" quando variação < −threshold%
(padrão: threshold = 30%)`}</Formula>

          <H2>Ocupação de estações</H2>
          <Formula>{`Para cada estação no período:
  minutos_carregados = Σ duration_minutes (todas as sessões)
  capacidade         = operating_hours × 60 × dias_com_dados

  occupancy_pct = minutos_carregados / capacidade × 100%`}</Formula>

          <H2>Conversão e aprovação de pagamentos</H2>
          <Formula>{`tentativas = total de sessões (qualquer status)
pagas     = sessões com is_paid = true
rejeitadas = sessões com payment_status = 'rejected'

taxa_conversão  = pagas / tentativas × 100%
taxa_aprovação  = pagas / total_sessões × 100%
taxa_rejeição   = rejeitadas / tentativas × 100%`}</Formula>

          <H2>Power users e concentração de receita</H2>
          <Formula>{`power_users = usuários com ≥ 5 sessões no período
receita_power = Σ revenue_total de sessões de power_users

concentração = receita_power / receita_total × 100%

Indica dependência: alta concentração significa que
perder poucos usuários impacta muito a receita.`}</Formula>

          {/* Footer */}
          <div className="mt-20 pt-8 border-t border-slate-200 text-center text-sm text-slate-400">
            <p>FinanceDash — Documentação técnica interna</p>
            <p className="mt-1">
              <Link href="/dashboard" className="hover:text-slate-600 transition-colors">
                Abrir dashboard
              </Link>
              {" · "}
              <a href="http://localhost:8000/api/docs" className="hover:text-slate-600 transition-colors">
                Swagger UI
              </a>
              {" · "}
              <Link href="/" className="hover:text-slate-600 transition-colors">
                Página inicial
              </Link>
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
