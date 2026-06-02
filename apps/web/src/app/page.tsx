"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import {
  Zap, TrendingUp, Clock, ChevronRight, CheckCircle2,
  BarChart3, Mail, ArrowRight, Loader2, ChevronDown,
  MapPin, Search,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ── Brand tokens (Intelbras) ───────────────────────────────────────────────────
const BRAND = {
  primary: "#06CB3F",       // Verde Institucional
  dark: "#163134",          // Verde Grandes Projetos
  darker: "#0d2427",
  lightGray: "#EFEFED",     // Cinza-Claro
  midGray: "#B9B5B4",       // Cinza-Médio
  black: "#000000",
};

// ── Constantes ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: "A simulação tem algum custo?", a: "Não. A simulação é completamente gratuita e não gera nenhum compromisso comercial." },
  { q: "Os dados fornecidos são seguros?", a: "Sim. Seus dados são usados exclusivamente para personalizar a análise e não são compartilhados com terceiros." },
  { q: "A simulação é precisa?", a: "Os resultados são estimativas baseadas em médias de mercado. Os valores reais dependem de localização, demanda local, tarifa de energia e custos operacionais." },
  { q: "Depois da simulação, posso falar com um especialista?", a: "Sim. Após receber os resultados, nossa equipe pode agendar uma consultoria para detalhar o projeto com dados reais." },
];

const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://financedash.com.br/#org",
      name: "FinanceDash",
      url: "https://financedash.com.br",
      description: "Plataforma SaaS de gestão financeira para redes de carregamento de veículos elétricos no Brasil.",
      contactPoint: { "@type": "ContactPoint", contactType: "sales", availableLanguage: "pt-BR" },
    },
    {
      "@type": "WebSite",
      "@id": "https://financedash.com.br/#website",
      url: "https://financedash.com.br",
      name: "FinanceDash — Gestão Financeira de Eletropostos",
      publisher: { "@id": "https://financedash.com.br/#org" },
      inLanguage: "pt-BR",
    },
    {
      "@type": "SoftwareApplication",
      name: "FinanceDash",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "pt-BR",
      description: "Dashboard financeiro para gestão de eletropostos: KPIs de sessão, receita, payback e ROI de carregadores AC e DC.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
        description: "Simulação gratuita de retorno para eletropostos",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
});

const SECTORS = [
  "Shopping Center / Mall",
  "Hotel / Pousada",
  "Posto de Gasolina / Conveniência",
  "Estacionamento Público/Privado",
  "Condomínio Residencial",
  "Condomínio Corporativo",
  "Supermercado / Varejo",
  "Restaurante / Alimentação",
  "Aeroporto / Terminal",
  "Educação (Universidade / Escola)",
  "Saúde (Hospital / Clínica)",
  "Outros",
];

const POSITIONS = [
  "Proprietário / Sócio",
  "Diretor / CEO",
  "Gerente Operacional",
  "Gerente Financeiro",
  "Engenheiro / Técnico",
  "Consultor / Assessor",
  "Outro",
];

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

/** Formata CPF (11 dígitos) ou CNPJ (12-14 dígitos) conforme o usuário digita. */
function formatDocument(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    if (d.length <= 3)  return d;
    if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  // CNPJ: 00.000.000/0000-00
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  if (d.length <= 13) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (s: string, w: number[]) => {
    const r = s.split("").reduce((a, c, i) => a + parseInt(c) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return parseInt(d[9])  === calc(d.slice(0,9),  [10,9,8,7,6,5,4,3,2]) &&
         parseInt(d[10]) === calc(d.slice(0,10), [11,10,9,8,7,6,5,4,3,2]);
}

function validateCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (s: string, w: number[]) => {
    const r = s.split("").reduce((a, c, i) => a + parseInt(c) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return parseInt(d[12]) === calc(d.slice(0,12), [5,4,3,2,9,8,7,6,5,4,3,2]) &&
         parseInt(d[13]) === calc(d.slice(0,13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
}

/** Valida CPF ou CNPJ e retorna o tipo detectado. */
function validateDocument(doc: string): { valid: boolean; type: "cpf" | "cnpj" | null } {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) return { valid: validateCPF(digits),  type: "cpf"  };
  if (digits.length === 14) return { valid: validateCNPJ(digits), type: "cnpj" };
  return { valid: false, type: null };
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0,4)}-${d.slice(4)}`;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SimResult {
  monthly_revenue: number;
  monthly_net: number;
  payback_months: number | null;
  payback_years: number | null;
  npv_5y: number;
  irr_annual_pct: number;
  roi_5y_pct: number;
  monthly_projections: { month: number; revenue: number; net: number; cumulative: number }[];
  charger_type: string;
  num_chargers: number;
  sessions_per_month: number;
  kwh_per_month: number;
}

interface ChargerType {
  key: string;
  label: string;
  power_kw: number;
  price_brl: number;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { loading } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);

  // Não redirecionar usuário logado — ele pode querer ver a landing page/simulador

  // Step
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [chargerTypes, setChargerTypes] = useState<ChargerType[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Mensagem ao especialista (após resultado)
  const [specialistMsg, setSpecialistMsg] = useState("");
  const [specialistSending, setSpecialistSending] = useState(false);
  const [specialistSent, setSpecialistSent] = useState(false);
  const [specialistError, setSpecialistError] = useState("");

  // Step 1
  const [sector, setSector] = useState("");
  const [chargerType, setChargerType] = useState("");
  const [numChargers, setNumChargers] = useState(1);

  // Step 2
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [ddd, setDdd] = useState("");
  const [phone, setPhone] = useState("");
  const [stateUF, setStateUF] = useState("");
  const [city, setCity] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [position, setPosition] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load charger types
  useEffect(() => {
    fetch("/api/v1/public/config")
      .then((r) => r.json())
      .then((d) => setChargerTypes(d.charger_types ?? []))
      .catch(() => {});
  }, []);

  // Load cities when state changes
  useEffect(() => {
    if (!stateUF) { setCities([]); setCity(""); setCityQuery(""); return; }
    setCitiesLoading(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateUF}/municipios?orderBy=nome`)
      .then((r) => r.json())
      .then((data: { nome: string }[]) => setCities(data.map((m) => m.nome)))
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
    setCity("");
    setCityQuery("");
  }, [stateUF]);

  // Close city dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredCities = cityQuery
    ? cities.filter((c) => c.toLowerCase().includes(cityQuery.toLowerCase())).slice(0, 80)
    : cities.slice(0, 80);

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleSendSpecialistMessage = async () => {
    if (!specialistMsg.trim() || !leadId) return;
    setSpecialistSending(true);
    setSpecialistError("");
    try {
      const res = await fetch(
        `/api/v1/public/leads/${leadId}/specialist-message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: specialistMsg }),
        }
      );
      if (!res.ok) throw new Error();
      setSpecialistSent(true);
    } catch {
      setSpecialistError("Não foi possível enviar. Tente novamente.");
    } finally {
      setSpecialistSending(false);
    }
  };
  const scrollToResult = () =>
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  // Validation
  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!sector) e.sector = "Selecione o setor";
    if (!chargerType) e.chargerType = "Selecione o modelo de carregador";
    if (numChargers < 1) e.numChargers = "Mínimo 1 ponto";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Informe seu nome completo";
    if (!cnpj.trim()) {
      e.cnpj = "Informe o CPF ou CNPJ";
    } else {
      const { valid, type } = validateDocument(cnpj);
      if (!valid) {
        const digits = cnpj.replace(/\D/g, "").length;
        if (type === null && digits < 11) e.cnpj = "Documento incompleto";
        else if (type === "cpf")  e.cnpj = "CPF inválido. Verifique os dígitos.";
        else                      e.cnpj = "CNPJ inválido. Verifique os dígitos.";
      }
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = "E-mail inválido";
    if (!ddd.trim() || ddd.replace(/\D/g, "").length !== 2) e.ddd = "DDD inválido (2 dígitos)";
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 9) e.phone = "Número inválido (8 ou 9 dígitos)";
    if (!stateUF) e.state = "Selecione o estado";
    if (!city) e.city = "Selecione a cidade";
    if (!position) e.position = "Selecione o cargo";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validateStep1()) return;
    setStep(2);
    scrollToForm();
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/v1/public/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, cnpj, email,
            phone: `(${ddd}) ${phone}`,
            state: stateUF, city,
            charger_type: chargerType,
            sector, position,
            num_chargers: numChargers,
            message: message.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        let errMsg = "Ocorreu um erro. Tente novamente em instantes.";
        try {
          const body = await res.json();
          if (typeof body.detail === "string") errMsg = body.detail;
          else if (Array.isArray(body.detail))
            errMsg = body.detail.map((e: { msg?: string }) => e.msg ?? "").filter(Boolean).join("; ");
        } catch { /* ignore parse error */ }
        setErrors({ submit: errMsg });
        return;
      }
      const data = await res.json();
      setResult(data.simulation);
      setLeadId(data.lead_id);
      // Reset specialist form for the new simulation
      setSpecialistSent(false);
      setSpecialistMsg("");
      scrollToResult();
    } catch {
      setErrors({ submit: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSimulation = () => {
    setResult(null);
    setLeadId(null);
    setSpecialistSent(false);
    setSpecialistMsg("");
    setErrors({});
    setStep(1);
    scrollToForm();
  };

  if (loading) return null;

  const selectedCharger = chargerTypes.find((c) => c.key === chargerType);

  const fieldCls = (err?: string) =>
    cn(
      "w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 bg-white text-slate-900",
      err ? "border-red-400 focus:ring-red-400" : "border-slate-200 focus:ring-[#06CB3F]"
    );

  return (
    <div className="min-h-screen bg-white font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#163134]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo height={30} />
          <div className="flex items-center gap-3">
            <button
              onClick={scrollToForm}
              className="hidden sm:block text-sm text-white/70 hover:text-white transition-colors font-medium"
            >
              Simular agora
            </button>
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        className="relative pt-16 min-h-[92vh] flex items-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.darker} 50%, ${BRAND.dark} 100%)` }}
      >
        {/* Decoração angular Intelbras */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-32 right-0 w-[500px] h-[500px] opacity-10"
            style={{
              background: `radial-gradient(circle, ${BRAND.primary} 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-96 h-96 opacity-5"
            style={{ background: `radial-gradient(circle, ${BRAND.primary} 0%, transparent 70%)` }}
          />
          {/* Linhas angulares */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="30%" x2="100%" y2="70%" stroke={BRAND.primary} strokeWidth="1" />
            <line x1="0" y1="60%" x2="100%" y2="20%" stroke={BRAND.primary} strokeWidth="0.5" />
            <line x1="20%" y1="0" x2="80%" y2="100%" stroke={BRAND.primary} strokeWidth="0.5" />
          </svg>
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-7 border"
              style={{ backgroundColor: `${BRAND.primary}20`, borderColor: `${BRAND.primary}40`, color: BRAND.primary }}
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              Simulação gratuita · Resultado em 2 minutos
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Calcule o retorno da<br />
              <span style={{ color: BRAND.primary }}>sua estação de recarga</span>
            </h1>

            <p className="text-lg text-white/70 mb-10 leading-relaxed max-w-lg">
              Descubra em minutos quanto sua estação de recarga pode faturar, quando recupera o
              investimento e qual o retorno projetado em 5 anos.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={scrollToForm}
                className="flex items-center justify-center gap-2 px-8 py-4 font-bold rounded-xl transition-all text-lg"
                style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
              >
                Simular meu retorno
                <ArrowRight className="h-5 w-5" />
              </button>
              <Link
                href="/solucao"
                className="flex items-center justify-center gap-2 px-8 py-4 border border-white/20 text-white hover:bg-white/10 rounded-xl transition-all text-lg"
              >
                Saber mais sobre o meu investimento
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-white/50">
              {["100% gratuito", "Sem compromisso", "Resultado por e-mail"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" style={{ color: BRAND.primary }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — preview card */}
          <div className="hidden lg:block">
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-4 font-medium">Exemplo de resultado</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: "Receita/mês", value: "R$ 9.800", color: BRAND.primary },
                  { label: "Payback", value: "18 meses", color: "#85FFC5" },
                  { label: "ROI 5 anos", value: "245%", color: "#85FFC5" },
                  { label: "VPL 5 anos", value: "R$ 312k", color: BRAND.primary },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">{label}</p>
                    <p className="text-xl font-bold" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="h-20 relative flex items-end justify-around px-2 gap-1">
                {[30, 45, 60, 75, 90, 100, 95, 110].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${h}%`,
                      background: `linear-gradient(to top, ${BRAND.primary}, ${BRAND.primary}80)`,
                      opacity: 0.8,
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-white/30 text-center mt-2">Fluxo de caixa acumulado — 24 meses</p>
              <div
                className="absolute -top-3 -right-3 text-xs font-bold px-3 py-1 rounded-full shadow"
                style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
              >
                DC 60 kW · 2 pontos
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: BRAND.primary }}>
        <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            { value: "245%+", label: "ROI médio projetado em 5 anos" },
            { value: "~18 meses", label: "Payback médio estimado" },
            { value: "R$ 9.800", label: "Receita/mês média (DC 60 kW)" },
          ].map(({ value, label }) => (
            <div key={label} style={{ color: BRAND.dark }}>
              <p className="text-3xl font-extrabold tracking-tight">{value}</p>
              <p className="text-sm mt-1 opacity-70 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Como funciona ─────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: BRAND.lightGray }} className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-14">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={{ color: BRAND.dark }}>
              Como funciona
            </h2>
            <p className="text-slate-500 text-lg">Em 3 passos simples você recebe sua análise completa</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: BarChart3, title: "Escolha o carregador", desc: "Selecione o modelo de carregador EV e a quantidade de pontos que deseja instalar." },
              { icon: Mail, title: "Preencha seus dados", desc: "Informe seus dados para personalizar a análise e receber o relatório completo." },
              { icon: TrendingUp, title: "Veja os resultados", desc: "Resultado imediato na tela + relatório detalhado enviado gratuitamente ao seu e-mail." },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="relative bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5"
                  style={{ backgroundColor: `${BRAND.primary}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color: BRAND.primary }} />
                </div>
                <div
                  className="absolute -top-3 -left-3 w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center shadow"
                  style={{ backgroundColor: BRAND.dark, color: BRAND.primary }}
                >
                  {i + 1}
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: BRAND.dark }}>{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Formulário ───────────────────────────────────────────────────────── */}
      <section ref={formRef} id="simulador" className="py-20 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="mb-10">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={{ color: BRAND.dark }}>
              Simule seu retorno
            </h2>
            <p className="text-slate-500">Preencha os campos abaixo e receba a análise na tela e por e-mail</p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            {[
              { n: 1, label: "Configuração" },
              { n: 2, label: "Seus dados" },
            ].map(({ n, label }, idx) => (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 transition-colors"
                  style={
                    step >= n
                      ? { backgroundColor: BRAND.primary, color: BRAND.dark }
                      : { backgroundColor: BRAND.lightGray, color: BRAND.midGray }
                  }
                >
                  {n}
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: step >= n ? BRAND.dark : BRAND.midGray }}
                >
                  {label}
                </span>
                {idx < 1 && (
                  <div
                    className="flex-1 h-0.5 rounded transition-colors"
                    style={{ backgroundColor: step > n ? BRAND.primary : BRAND.lightGray }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">

            {/* ── Step 1 ──────────────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Setor */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: BRAND.dark }}>
                    Qual é o setor do seu negócio?
                  </label>
                  <select
                    value={sector}
                    onChange={(e) => { setSector(e.target.value); setErrors((p) => ({ ...p, sector: "" })); }}
                    className={fieldCls(errors.sector)}
                  >
                    <option value="">Selecione o setor...</option>
                    {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.sector && <p className="text-red-500 text-xs mt-1.5">{errors.sector}</p>}
                </div>

                {/* Carregador */}
                <div>
                  <label className="block text-sm font-semibold mb-3" style={{ color: BRAND.dark }}>
                    Qual carregador te interessa?
                  </label>
                  {(() => {
                    const list = chargerTypes.length > 0
                      ? chargerTypes
                      : [
                          { key: "DC 60 kW", label: "DC 60 kW", power_kw: 60, price_brl: 75000 },
                          { key: "DC 120 kW", label: "DC 120 kW", power_kw: 120, price_brl: 130000 },
                        ];
                    const acList = list.filter((c) => c.key.startsWith("AC"));
                    const dcList = list.filter((c) => c.key.startsWith("DC"));

                    const renderGroup = (label: string, items: typeof list) => {
                      if (items.length === 0) return null;
                      return (
                        <div className="mb-3">
                          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: BRAND.midGray }}>
                            {label}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {items.map((c) => {
                              const displayLabel = c.label.replace(/^(AC|DC)\s+/i, "");
                              const active = chargerType === c.key;
                              return (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => { setChargerType(c.key); setErrors((p) => ({ ...p, chargerType: "" })); }}
                                  className="flex flex-col items-center p-3.5 rounded-xl border-2 text-center transition-all"
                                  style={
                                    active
                                      ? { borderColor: BRAND.primary, backgroundColor: `${BRAND.primary}10`, color: BRAND.dark }
                                      : { borderColor: "#e2e8f0", color: "#475569" }
                                  }
                                >
                                  <Zap
                                    className="h-5 w-5 mb-1.5"
                                    style={active ? { fill: BRAND.primary, color: BRAND.primary } : { color: BRAND.midGray }}
                                  />
                                  <span className="font-bold text-sm">{displayLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderGroup("CA — Corrente Alternada", acList)}
                        {renderGroup("CC — Corrente Contínua", dcList)}
                      </>
                    );
                  })()}
                  {errors.chargerType && <p className="text-red-500 text-xs mt-1.5">{errors.chargerType}</p>}
                </div>

                {/* Quantidade */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: BRAND.dark }}>
                    Quantos pontos de recarga?
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="number" min={1} max={500}
                      value={numChargers}
                      onChange={(e) => setNumChargers(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-28 px-4 py-3 rounded-xl border border-slate-200 text-sm text-center focus:outline-none focus:ring-2"
                      style={{ ["--tw-ring-color" as string]: BRAND.primary }}
                    />
                    <span className="text-sm text-slate-500">pontos de recarga</span>
                  </div>
                  {selectedCharger && (
                    <p className="text-xs text-slate-400 mt-2">
                      Estimativa de investimento:{" "}
                      <strong className="text-slate-600">{fmtBRL(selectedCharger.price_brl * numChargers)}</strong>
                    </p>
                  )}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full py-3.5 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base"
                  style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
                >
                  Próximo: meus dados
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* ── Step 2 ──────────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Resumo step 1 */}
                <div
                  className="flex items-center gap-3 p-3 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: `${BRAND.primary}15`, color: BRAND.dark }}
                >
                  <Zap className="h-4 w-4 fill-current shrink-0" style={{ color: BRAND.primary }} />
                  <span><strong>{chargerType}</strong> × {numChargers} pontos · {sector}</span>
                  <button onClick={() => setStep(1)} className="ml-auto text-xs underline opacity-70 hover:opacity-100">editar</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nome */}
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>Nome completo *</label>
                    <input type="text" value={name} placeholder="Seu nome completo"
                      onChange={(e) => setName(e.target.value)}
                      className={fieldCls(errors.name)} />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* CPF / CNPJ */}
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>
                      CPF ou CNPJ *
                    </label>
                    <input
                      type="text"
                      value={cnpj}
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      onChange={(e) => {
                        setCnpj(formatDocument(e.target.value));
                        setErrors((p) => ({ ...p, cnpj: "" }));
                      }}
                      className={fieldCls(errors.cnpj)}
                      maxLength={18}
                    />
                    {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj}</p>}
                    {!errors.cnpj && (() => {
                      const { valid, type } = validateDocument(cnpj);
                      return valid ? (
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: BRAND.primary }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {type === "cpf" ? "CPF válido" : "CNPJ válido"}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>E-mail *</label>
                    <input type="email" value={email} placeholder="seu@email.com"
                      onChange={(e) => setEmail(e.target.value)}
                      className={fieldCls(errors.email)} />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>

                  {/* DDD + Telefone */}
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>
                      Celular / WhatsApp *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">(</span>
                        <input
                          type="tel" value={ddd} placeholder="11" maxLength={2}
                          onChange={(e) => {
                            setDdd(e.target.value.replace(/\D/g,"").slice(0,2));
                            setErrors((p) => ({ ...p, ddd: "" }));
                          }}
                          className={cn(fieldCls(errors.ddd || errors.phone), "w-20 pl-6 pr-2 text-center")}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">)</span>
                      </div>
                      <input
                        type="tel" value={phone} placeholder="99999-9999"
                        onChange={(e) => {
                          setPhone(formatPhone(e.target.value));
                          setErrors((p) => ({ ...p, phone: "" }));
                        }}
                        className={cn(fieldCls(errors.phone), "flex-1")}
                      />
                    </div>
                    {(errors.ddd || errors.phone) && (
                      <p className="text-red-500 text-xs mt-1">{errors.ddd || errors.phone}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">DDD + número (8 ou 9 dígitos)</p>
                  </div>

                  {/* Estado */}
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>Estado *</label>
                    <select value={stateUF}
                      onChange={(e) => { setStateUF(e.target.value); setErrors((p) => ({ ...p, state: "" })); }}
                      className={fieldCls(errors.state)}>
                      <option value="">Selecione o estado...</option>
                      {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
                  </div>

                  {/* Cidade — combobox IBGE */}
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>Cidade *</label>
                    <div ref={cityRef} className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={city || cityQuery}
                          placeholder={
                            !stateUF ? "Selecione o estado primeiro"
                            : citiesLoading ? "Carregando cidades..."
                            : "Buscar cidade..."
                          }
                          disabled={!stateUF || citiesLoading}
                          onChange={(e) => {
                            setCityQuery(e.target.value);
                            setCity("");
                            setShowCityDropdown(true);
                            setErrors((p) => ({ ...p, city: "" }));
                          }}
                          onFocus={() => { if (stateUF && !citiesLoading) setShowCityDropdown(true); }}
                          className={cn(fieldCls(errors.city), "pl-9 disabled:opacity-50 disabled:cursor-not-allowed")}
                        />
                        {city && (
                          <CheckCircle2
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4"
                            style={{ color: BRAND.primary }}
                          />
                        )}
                      </div>
                      {showCityDropdown && filteredCities.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                          {filteredCities.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setCity(c);
                                setCityQuery(c);
                                setShowCityDropdown(false);
                                setErrors((p) => ({ ...p, city: "" }));
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:text-white transition-colors"
                              style={{ ["--hover-bg" as string]: BRAND.primary }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.primary)}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                  </div>

                  {/* Cargo */}
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>Qual é o seu cargo? *</label>
                    <select value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className={fieldCls(errors.position)}>
                      <option value="">Selecione...</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {errors.position && <p className="text-red-500 text-xs mt-1">{errors.position}</p>}
                  </div>

                  {/* Mensagem */}
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: BRAND.dark }}>
                      Mensagem para o especialista <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Conte mais sobre seu projeto, dúvidas ou contexto específico..."
                      rows={3}
                      maxLength={1000}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 resize-none bg-white text-slate-900"
                      style={{ ["--tw-ring-color" as string]: BRAND.primary }}
                    />
                    <p className="text-xs text-slate-400 mt-1 text-right">{message.length}/1000</p>
                  </div>
                </div>

                {errors.submit && (
                  <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    {errors.submit}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="px-5 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 py-3.5 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base disabled:opacity-60"
                    style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
                  >
                    {submitting ? (
                      <><Loader2 className="h-5 w-5 animate-spin" /> Calculando...</>
                    ) : (
                      <><TrendingUp className="h-5 w-5" /> Ver minha simulação</>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-400 text-center">
                  Seus dados são protegidos e utilizados exclusivamente para personalizar esta análise.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {result && (
        <section ref={resultRef} style={{ backgroundColor: BRAND.lightGray }} className="py-20">
          <div className="max-w-4xl mx-auto px-6">
            <div className="mb-10">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4"
                style={{ backgroundColor: `${BRAND.primary}20`, color: BRAND.dark }}
              >
                <CheckCircle2 className="h-4 w-4" style={{ color: BRAND.primary }} />
                Análise enviada para {email}
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-2" style={{ color: BRAND.dark }}>
                Resultado da simulação
              </h2>
              <p className="text-slate-500">
                {result.charger_type} · {result.num_chargers} {result.num_chargers === 1 ? "ponto" : "pontos"} · {sector}
              </p>
            </div>

            {/* Derive payback from monthly_projections so card matches chart */}
            {(() => {
              const chartPayback = result.monthly_projections.find((p) => p.cumulative >= 0)?.month ?? null;
              const paybackMonths = chartPayback ?? result.payback_months;
              const paybackYears = paybackMonths ? paybackMonths / 12 : null;

            return (<>
            {/* KPI cards — sem CAPEX */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                {
                  label: "Receita mensal estimada",
                  value: fmtBRL(result.monthly_revenue),
                  sub: `Lucro líq.: ${fmtBRL(result.monthly_net)}/mês`,
                  color: BRAND.primary,
                },
                {
                  label: "Payback estimado",
                  value: paybackMonths
                    ? `${paybackMonths} meses`
                    : "> 5 anos",
                  sub: paybackYears ? `~${paybackYears.toFixed(1)} anos` : "",
                  color: BRAND.dark,
                },
                {
                  label: "ROI projetado em 5 anos",
                  value: `${result.roi_5y_pct.toFixed(0)}%`,
                  sub: `VPL: ${fmtBRL(result.npv_5y)}`,
                  color: BRAND.dark,
                },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 font-medium">{label}</p>
                  <p className="text-2xl font-extrabold tracking-tight" style={{ color }}>{value}</p>
                  {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Secondary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Sessões/mês", value: fmtNum(result.sessions_per_month) },
                { label: "kWh/mês", value: fmtNum(result.kwh_per_month) },
                { label: "TIR estimada", value: `${result.irr_annual_pct.toFixed(1)}% a.a.` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white border border-slate-100 rounded-xl p-4 text-center shadow-sm">
                  <p className="text-xs text-slate-500 mb-1 font-medium">{label}</p>
                  <p className="text-xl font-bold" style={{ color: BRAND.dark }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {result.monthly_projections.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm mb-6">
                <h3 className="font-bold mb-4" style={{ color: BRAND.dark }}>
                  Fluxo de Caixa Acumulado — 24 meses
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.monthly_projections} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND.primary} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={BRAND.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tickFormatter={(v) => `M${v}`} tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => v >= 0 ? `R$${(v/1000).toFixed(0)}k` : `-R$${(Math.abs(v)/1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }} width={60}
                    />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), "Acumulado"]} labelFormatter={(l) => `Mês ${l}`} />
                    <Area type="monotone" dataKey="cumulative" stroke={BRAND.primary} strokeWidth={2.5} fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
                {paybackMonths && paybackMonths <= 24 && (
                  <p className="text-xs text-slate-500 text-center mt-2">
                    ✅ Ponto de payback no mês {paybackMonths}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-8">
              <span>⚠️</span>
              <p className="text-xs text-slate-500">
                Simulação estimada com parâmetros médios de mercado. Os resultados reais dependem de localização,
                demanda local, tarifas de energia e custos operacionais específicos do projeto.
              </p>
              <button
                onClick={handleNewSimulation}
                className="ml-auto shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap"
                style={{ borderColor: BRAND.primary, color: BRAND.dark }}
              >
                ↩ Nova simulação
              </button>
            </div>

            {/* Falar com especialista */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-1" style={{ color: BRAND.dark }}>
                Quer conversar com um especialista?
              </h3>
              <p className="text-slate-500 text-sm mb-4">
                Deixe uma mensagem e nossa equipe entrará em contato com você em breve.
              </p>
              {message && (
                <div
                  className="text-sm rounded-xl p-4 mb-4 border"
                  style={{ backgroundColor: `${BRAND.primary}10`, borderColor: `${BRAND.primary}30`, color: BRAND.dark }}
                >
                  <p className="font-semibold text-xs mb-1" style={{ color: BRAND.primary }}>Mensagem enviada no formulário:</p>
                  <p className="italic">"{message}"</p>
                </div>
              )}
              {!specialistSent ? (
                <>
                  <textarea
                    value={specialistMsg}
                    onChange={(e) => setSpecialistMsg(e.target.value)}
                    placeholder="Descreva seu projeto, dúvidas ou o que precisar..."
                    rows={4}
                    maxLength={2000}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 resize-none"
                    style={{ "--tw-ring-color": BRAND.primary } as React.CSSProperties}
                  />
                  <div className="flex items-center justify-between mt-1 mb-3">
                    {specialistError
                      ? <p className="text-red-500 text-xs">{specialistError}</p>
                      : <span />
                    }
                    <span className="text-xs text-slate-400">{specialistMsg.length}/2000</span>
                  </div>
                  <button
                    onClick={handleSendSpecialistMessage}
                    disabled={specialistSending || !specialistMsg.trim()}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
                  >
                    {specialistSending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Mail className="h-4 w-4" />
                    }
                    Enviar mensagem
                  </button>
                </>
              ) : (
                <div
                  className="flex items-center gap-2 text-sm font-semibold py-3 px-4 rounded-xl border"
                  style={{ color: BRAND.dark, backgroundColor: `${BRAND.primary}15`, borderColor: `${BRAND.primary}40` }}
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} />
                  Mensagem enviada! Nossa equipe entrará em contato em breve.
                </div>
              )}
            </div>
            </>);
            })()}
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold tracking-tight mb-12" style={{ color: BRAND.dark }}>
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map(({ q, a }, i) => (
              <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold hover:bg-[#EFEFED] transition-colors"
                  style={{ color: BRAND.dark }}
                >
                  {q}
                  <ChevronDown
                    className={cn("h-5 w-5 text-slate-400 transition-transform shrink-0 ml-4", openFaq === i && "rotate-180")}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-slate-600 text-sm leading-relaxed border-t pt-4" style={{ borderColor: BRAND.lightGray }}>
                    {a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ─────────────────────────────────────────────────────── */}
      <section className="py-20 text-center" style={{ backgroundColor: BRAND.dark }}>
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight">
            Pronto para descobrir o potencial do seu negócio?
          </h2>
          <p className="text-white/60 text-lg mb-8">
            Simulação gratuita · Resultado imediato · Relatório por e-mail
          </p>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 px-10 py-4 font-bold rounded-xl transition-all text-lg shadow-xl"
            style={{ backgroundColor: BRAND.primary, color: BRAND.dark }}
          >
            Simular agora — é grátis
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: "#0a1f22" }} className="py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo height={26} />
            <span className="text-white/30 text-sm hidden sm:inline">— Gestão Financeira de Eletropostos</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link href="/login" className="hover:text-white transition-colors">Entrar</Link>
            <a href="mailto:contato@financedash.com.br" className="hover:text-white transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
