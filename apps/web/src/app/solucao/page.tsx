import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3, TrendingUp, Zap, FileText, Users, Bell,
  CheckCircle2, ArrowRight, Shield, Clock, Download,
  PieChart, Activity, Layers, Target, Building2,
} from "lucide-react";
import { EnterpriseContactForm } from "./EnterpriseContactForm";

export const metadata: Metadata = {
  title: "Dashboard Financeiro para Eletropostos",
  description:
    "Gerencie o desempenho financeiro das suas estações de recarga em um único lugar. " +
    "KPIs em tempo real, DRE, análise de cohort, payback e ROI — tudo pensado para operadores de eletropostos.",
};

const GREEN = "#06CB3F";
const DARK  = "#163134";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Painel de KPIs",
    desc: "Receita, sessões, kWh entregue, ticket médio, taxa de conversão e muito mais — tudo em um único painel atualizado automaticamente.",
  },
  {
    icon: Activity,
    title: "Série Temporal",
    desc: "Evolução da receita e sessões ao longo do tempo. Identifique sazonalidades, picos de demanda e tendências de crescimento.",
  },
  {
    icon: Layers,
    title: "Ranking de Estações",
    desc: "Compare o desempenho entre pontos de recarga. Saiba quais estações faturam mais e onde há espaço para otimização.",
  },
  {
    icon: FileText,
    title: "DRE Automático",
    desc: "Demonstração do Resultado do Exercício com receita bruta, OPEX, EBITDA e lucro líquido separados por período.",
  },
  {
    icon: TrendingUp,
    title: "Calculadora de Payback",
    desc: "Simule cenários de occupancy e projete retorno do investimento com TIR, VPL e payback para novos pontos de carga.",
  },
  {
    icon: PieChart,
    title: "Análise de Cohort",
    desc: "Entenda a retenção de usuários e o comportamento de recarga ao longo do tempo para decisões orientadas a dados.",
  },
  {
    icon: Bell,
    title: "Alertas Inteligentes",
    desc: "Receba notificações automáticas por e-mail quando KPIs saírem dos limites definidos por você — sem surpresas.",
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    desc: "Controle de acesso com perfis granulares: proprietário, administrador, analista e visualizador. Roles customizáveis.",
  },
  {
    icon: Download,
    title: "Exportação e Relatórios",
    desc: "Exporte seus dados em CSV. Relatórios prontos para apresentar a investidores, parceiros e gestores.",
  },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "R$ 197",
    period: "/mês",
    highlight: false,
    description: "Ideal para operadores com poucos pontos de carga.",
    features: [
      "3 usuários",
      "5 arquivos de dados",
      "Todos os dashboards",
      "Exportação CSV",
      "Suporte por e-mail",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 497",
    period: "/mês",
    highlight: true,
    badge: "Mais popular",
    description: "Para redes com múltiplas estações e equipe analítica.",
    features: [
      "10 usuários",
      "30 arquivos de dados",
      "Todos os dashboards",
      "Exportação CSV + PDF",
      "Calculadora de payback avançada",
      "E-mails automáticos de relatório",
      "Análise individual de investimento por carregador",
      "IA para auxiliar em tomadas de decisão (em desenvolvimento)",
      "Suporte prioritário",
      "Cargos Customizáveis",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    highlight: false,
    description: "Para grandes redes, distribuidoras e integradores.",
    features: [
      "Usuários ilimitados",
      "Dados ilimitados",
      "CRM para Gestão dos Clientes",
      "API de integração",
      "SLA garantido",
      "Onboarding dedicado",
      "White-label disponível",
    ],
  },
];

const INTEGRATIONS = [
  { name: "Intelbras CVE-Pro", category: "Hardware", color: "#06CB3F" },
  { name: "Tupi",              category: "Hardware", color: "#3B82F6" },
  { name: "Voltbras",          category: "Hardware", color: "#8B5CF6" },
  { name: "movE",              category: "Hardware", color: "#F59E0B" },
  { name: "Spott",             category: "Hardware", color: "#10B981" },
];

const TESTIMONIALS = [
  {
    quote: "Antes levávamos dias para consolidar os dados das nossas estações. Hoje temos tudo em tempo real, com alertas automáticos quando alguma estação cai abaixo da meta.",
    author: "Gerente de Operações",
    org: "Rede de eletropostos — SP",
  },
  {
    quote: "O relatório de DRE automático nos ajudou a apresentar resultados para investidores com muito mais credibilidade. O payback projetado pela plataforma ficou dentro de 5% do real.",
    author: "CFO",
    org: "Operadora de estações DC — MG",
  },
];

export default function SolucaoPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Header ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b border-white/10"
        style={{ backgroundColor: `${DARK}f5` }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: GREEN }}>
              <Zap className="h-5 w-5 fill-current" style={{ color: DARK }} />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">FinanceDash</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden sm:block text-sm text-white/70 hover:text-white transition-colors font-medium">
              Simular agora
            </Link>
            <Link
              href="/login"
              className="hidden sm:block text-sm text-white/70 hover:text-white transition-colors font-medium border border-white/20 px-3 py-1.5 rounded-lg"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: GREEN, color: DARK }}
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="pt-16 min-h-[80vh] flex items-center"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #0d2427 60%, ${DARK} 100%)` }}
      >
        <div className="max-w-6xl mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-7 border"
              style={{ backgroundColor: `${GREEN}20`, borderColor: `${GREEN}40`, color: GREEN }}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard Financeiro para Eletropostos
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Gerencie o retorno das suas{" "}
              <span style={{ color: GREEN }}>estações de recarga</span>{" "}
              com inteligência
            </h1>

            <p className="text-lg text-white/70 mb-10 leading-relaxed max-w-lg">
              Do upload dos dados ao relatório de DRE — uma plataforma completa
              para operadores de eletropostos que querem tomar decisões baseadas em números,
              não em intuição.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="flex items-center justify-center gap-2 px-8 py-4 font-bold rounded-xl transition-all text-lg"
                style={{ backgroundColor: GREEN, color: DARK }}
              >
                Criar conta gratuita
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/"
                className="flex items-center justify-center gap-2 px-8 py-4 border border-white/20 text-white hover:bg-white/10 rounded-xl transition-all text-lg"
              >
                Ver simulação de ROI
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-white/50">
              {["Sem cartão de crédito", "14 dias grátis", "Cancele quando quiser"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" style={{ color: GREEN }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — dashboard preview */}
          <div className="hidden lg:block">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: GREEN }} />
                <span className="text-xs text-white/50 font-medium">Painel em tempo real</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Receita / mês",  value: "R$ 38.400", delta: "+12%", positive: true },
                  { label: "Sessões / mês",  value: "1.284",     delta: "+8%",  positive: true },
                  { label: "kWh entregue",   value: "18.720",    delta: "+15%", positive: true },
                  { label: "Ticket médio",   value: "R$ 29,90",  delta: "-2%",  positive: false },
                ].map(({ label, value, delta, positive }) => (
                  <div key={label} className="bg-white/5 rounded-xl p-3.5">
                    <p className="text-xs text-white/40 mb-1">{label}</p>
                    <p className="text-lg font-bold text-white">{value}</p>
                    <p className="text-xs mt-0.5" style={{ color: positive ? GREEN : "#f87171" }}>
                      {delta} vs. mês anterior
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-white/5 rounded-xl p-3.5">
                <p className="text-xs text-white/40 mb-2">Receita acumulada — 12 meses</p>
                <div className="flex items-end gap-1 h-14">
                  {[55, 62, 58, 70, 75, 80, 85, 72, 90, 95, 88, 100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${h}%`,
                        backgroundColor: i === 11 ? GREEN : `${GREEN}60`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Números ── */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: "9+",        label: "Painéis analíticos"     },
            { value: "R$ 497/mês", label: "Plano Pro"              },
            { value: "14 dias",   label: "Trial gratuito"         },
            { value: "99,9%",     label: "SLA de disponibilidade" },
          ].map(({ value, label }) => (
            <div key={label} style={{ color: DARK }}>
              <p className="text-2xl font-extrabold tracking-tight">{value}</p>
              <p className="text-sm mt-1 opacity-70 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section className="py-24" style={{ backgroundColor: "#EFEFED" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={{ color: DARK }}>
              Tudo que você precisa para gerir seu eletroposto
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Cada painel foi desenvolvido com base nas necessidades reais de operadores
              de estações de recarga no Brasil.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${GREEN}15` }}
                >
                  <Icon className="h-5 w-5" style={{ color: GREEN }} />
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: DARK }}>{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para quem é ── */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-4" style={{ color: DARK }}>
                Desenvolvido para quem opera estações de recarga
              </h2>
              <p className="text-slate-500 text-lg mb-8 leading-relaxed">
                Do MEI que instalou seu primeiro ponto de carga até redes com dezenas de
                estações distribuídas pelo Brasil — o FinanceDash escala com o seu negócio.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Building2, title: "Estacionamentos e shoppings", desc: "Monetize a área de estacionamento com carregadores AC e DC." },
                  { icon: Target,    title: "Postos de combustível",        desc: "Diversifique receita e atenda clientes de VE enquanto carregam." },
                  { icon: Shield,    title: "Condomínios e empresas",       desc: "Ofereça benefício de recarga para moradores e colaboradores." },
                  { icon: Clock,    title: "Integradores e instaladores",   desc: "Mostre ROI para seus clientes e feche mais contratos." },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${GREEN}15` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: GREEN }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: DARK }}>{title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual — fluxo simplificado */}
            <div className="space-y-3">
              {[
                { step: "1", title: "Importe seus dados",     desc: "Faça upload do arquivo CSV com as sessões de recarga. Processamento automático em segundos.", color: `${GREEN}20` },
                { step: "2", title: "Visualize os painéis",   desc: "KPIs, gráficos de série temporal, ranking de estações e DRE disponíveis imediatamente.", color: `${GREEN}30` },
                { step: "3", title: "Receba alertas",         desc: "Configure thresholds e receba notificações quando o desempenho sair do esperado.", color: `${GREEN}40` },
                { step: "4", title: "Tome decisões",          desc: "Use a calculadora de payback para decidir onde instalar os próximos pontos de carga.", color: GREEN },
              ].map(({ step, title, desc, color }) => (
                <div
                  key={step}
                  className="flex items-start gap-4 p-4 rounded-xl border"
                  style={{ borderColor: `${GREEN}30`, backgroundColor: `${GREEN}08` }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{ backgroundColor: color, color: DARK }}
                  >
                    {step}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: DARK }}>{title}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section className="py-20" style={{ backgroundColor: "#EFEFED" }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-extrabold text-center mb-12" style={{ color: DARK }}>
            O que dizem os operadores
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TESTIMONIALS.map(({ quote, author, org }) => (
              <div key={author} className="bg-white rounded-2xl p-7 shadow-sm border border-slate-100">
                <p className="text-slate-600 text-sm leading-relaxed mb-5 italic">"{quote}"</p>
                <div>
                  <p className="font-semibold text-sm" style={{ color: DARK }}>{author}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{org}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ── */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={{ color: DARK }}>
              Planos e preços
            </h2>
            <p className="text-slate-500 text-lg">14 dias de trial gratuito em todos os planos. Sem cartão de crédito.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border-2 p-7 relative"
                style={{
                  borderColor: plan.highlight ? GREEN : "#e2e8f0",
                  boxShadow: plan.highlight ? `0 0 0 4px ${GREEN}15` : undefined,
                }}
              >
                {plan.badge && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: GREEN, color: DARK }}
                  >
                    {plan.badge}
                  </div>
                )}

                <h3 className="text-xl font-extrabold mb-1" style={{ color: DARK }}>{plan.name}</h3>
                <p className="text-sm text-slate-500 mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-extrabold" style={{ color: plan.highlight ? GREEN : DARK }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-slate-400 text-sm">{plan.period}</span>
                  )}
                </div>

                {plan.id === "enterprise" ? (
                  <EnterpriseContactForm />
                ) : (
                  <Link
                    href="/register"
                    className="block w-full text-center py-3 rounded-xl font-bold text-sm transition-all mb-6"
                    style={
                      plan.highlight
                        ? { backgroundColor: GREEN, color: DARK }
                        : { backgroundColor: "#f1f5f9", color: DARK }
                    }
                  >
                    Começar trial grátis
                  </Link>
                )}

                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: GREEN }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrações ── */}
      <section className="py-20" style={{ backgroundColor: "#EFEFED" }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-extrabold mb-3" style={{ color: DARK }}>
              Integrações e compatibilidade
            </h2>
            <p className="text-slate-500">
              Importe dados de qualquer plataforma de recarga via CSV padrão.
              Integrações nativas em expansão.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {INTEGRATIONS.map(({ name, category, color }) => (
              <div
                key={name}
                className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-2.5 border border-slate-100 shadow-sm"
              >
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-semibold text-sm" style={{ color: DARK }}>{name}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{category}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Compatível com qualquer exportação CSV de plataformas OCPP. Novos conectores são adicionados regularmente.
          </p>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="py-24 text-center" style={{ backgroundColor: DARK }}>
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight">
            Comece a gerenciar seus eletropostos com inteligência
          </h2>
          <p className="text-white/60 text-lg mb-8">
            14 dias grátis · Sem cartão de crédito · Resultado imediato
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 font-bold rounded-xl transition-all text-lg shadow-xl"
              style={{ backgroundColor: GREEN, color: DARK }}
            >
              Criar conta gratuita
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 border border-white/20 text-white hover:bg-white/10 rounded-xl transition-all text-lg"
            >
              Ver simulação de ROI
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: "#0a1f22" }} className="py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: GREEN }}>
              <Zap className="h-4 w-4 fill-current" style={{ color: DARK }} />
            </div>
            <span className="font-bold text-white tracking-tight">FinanceDash</span>
            <span className="text-white/30">— Gestão Financeira de Eletropostos</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link href="/" className="hover:text-white transition-colors">Simular ROI</Link>
            <Link href="/login" className="hover:text-white transition-colors">Entrar</Link>
            <a href="mailto:contato@financedash.com.br" className="hover:text-white transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
