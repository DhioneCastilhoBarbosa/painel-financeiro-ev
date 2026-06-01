"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";

const GREEN = "#06CB3F";
const DARK  = "#163134";
function formatDocument(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3)  return d;
    if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length < 3)   return d;
  if (d.length < 7)   return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

const FIELD_PT: Record<string, string> = {
  name: "Nome", cnpj: "CPF/CNPJ", email: "E-mail",
  phone: "Celular", company: "Empresa", position: "Cargo", message: "Mensagem",
};

function translateMsg(raw: string): string {
  if (/value is not a valid email/i.test(raw)) return "e-mail inválido";
  if (/field required/i.test(raw))             return "campo obrigatório";
  const m = raw.match(/at least (\d+) char/i);
  if (m) return `mínimo ${m[1]} caracteres`;
  return raw;
}

/** Normaliza tanto string simples quanto array Pydantic v2. */
function parsePydanticDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail))     return "Erro de validação. Tente novamente.";
  return detail
    .map((e: { msg?: string; loc?: unknown[] }) => {
      const field = Array.isArray(e.loc)
        ? e.loc.filter((s) => String(s) !== "body").pop()
        : undefined;
      const label = field ? (FIELD_PT[String(field)] ?? String(field)) : "";
      const msg   = translateMsg(e.msg ?? "");
      return label ? `${label}: ${msg}` : msg;
    })
    .filter(Boolean)
    .join("; ");
}

const EMPTY = {
  name: "", cnpj: "", email: "", phone: "",
  company: "", position: "", message: "",
};

const POSITIONS = [
  "Proprietário / Sócio", "Diretor / CEO",
  "Gerente Operacional", "Gerente Financeiro",
  "Engenheiro / Técnico", "Consultor / Assessor", "Outro",
];

export function EnterpriseContactForm() {
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState({ ...EMPTY });
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState("");

  const setF = (k: keyof typeof EMPTY, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    // Validação client-side com mensagens específicas
    const errs: string[] = [];
    if (!form.name.trim() || form.name.trim().length < 2)
      errs.push("Nome: mínimo 2 caracteres");
    if (!form.cnpj || form.cnpj.replace(/\D/g, "").length < 11)
      errs.push("CPF/CNPJ: incompleto");
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      errs.push("E-mail: inválido");
    if (!form.phone || form.phone.replace(/\D/g, "").length < 10)
      errs.push("Celular: mínimo 10 dígitos (DDD + número)");
    if (!form.position)
      errs.push("Cargo: selecione uma opção");
    if (errs.length > 0) {
      setError(errs.join(" · "));
      return;
    }

    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/v1/public/enterprise-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     form.name.trim(),
          cnpj:     form.cnpj,
          email:    form.email.trim(),
          phone:    form.phone,
          company:  form.company.trim() || null,
          position: form.position,
          message:  form.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Normaliza tanto string quanto array Pydantic v2
        throw new Error(parsePydanticDetail(body.detail) || `Erro ${res.status}`);
      }
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar ao servidor.");
    } finally {
      setSending(false);
    }
  };

  const fieldCls = "w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#163134]";

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="block w-full text-center py-3 rounded-xl font-bold text-sm transition-all mb-6"
        style={{ backgroundColor: "#f1f5f9", color: DARK }}
      >
        Falar com vendas
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ backgroundColor: DARK }}>
              <div>
                <h2 className="font-bold text-white text-lg">Falar com a equipe de vendas</h2>
                <p className="text-white/60 text-xs mt-0.5">Plano Enterprise · Grandes redes e distribuidoras</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sent ? (
              /* Success state */
              <div className="px-6 py-12 text-center">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: `${GREEN}20` }}
                >
                  <CheckCircle2 className="h-7 w-7" style={{ color: GREEN }} />
                </div>
                <h3 className="font-bold text-xl mb-2" style={{ color: DARK }}>Mensagem enviada!</h3>
                <p className="text-slate-500 text-sm mb-6">
                  Nossa equipe entrará em contato em até 1 dia útil.
                </p>
                <button
                  onClick={() => { setOpen(false); setSent(false); setForm({ ...EMPTY }); }}
                  className="px-6 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: GREEN, color: DARK }}
                >
                  Fechar
                </button>
              </div>
            ) : (
              /* Form */
              <div className="px-6 py-5 space-y-3 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>Nome completo *</label>
                    <input className={fieldCls} placeholder="Seu nome" value={form.name}
                      onChange={(e) => setF("name", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>CPF / CNPJ *</label>
                    <input className={fieldCls} placeholder="000.000.000-00" value={form.cnpj}
                      onChange={(e) => setF("cnpj", formatDocument(e.target.value))} maxLength={18} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>Celular *</label>
                    <input className={fieldCls} placeholder="(11) 99999-9999" value={form.phone}
                      onChange={(e) => setF("phone", formatPhone(e.target.value))} maxLength={15} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>E-mail *</label>
                    <input type="email" className={fieldCls} placeholder="seu@empresa.com" value={form.email}
                      onChange={(e) => setF("email", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>Empresa</label>
                    <input className={fieldCls} placeholder="Nome da empresa" value={form.company}
                      onChange={(e) => setF("company", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>Cargo *</label>
                    <select className={fieldCls} value={form.position}
                      onChange={(e) => setF("position", e.target.value)}>
                      <option value="">Selecione...</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold mb-1" style={{ color: DARK }}>
                      Mensagem <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <textarea
                      rows={3}
                      className={`${fieldCls} resize-none`}
                      placeholder="Fale sobre sua rede de eletropostos, número de estações, necessidades..."
                      value={form.message}
                      onChange={(e) => setF("message", e.target.value)}
                      maxLength={2000}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-1 pb-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={sending}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: GREEN, color: DARK }}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {sending ? "Enviando..." : "Enviar mensagem"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
