import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

let accessToken: string | null = null;

export function setToken(token: string | null) {
  accessToken = token;
}

export function getToken() {
  return accessToken;
}

// ── Pydantic v2 → PT-BR translations ─────────────────────────────────────────

/** Maps Pydantic v2 field names to Portuguese labels. */
const FIELD_PT: Record<string, string> = {
  email:             "E-mail",
  password:          "Senha",
  name:              "Nome",
  organization_name: "Nome da empresa",
  phone:             "Telefone",
  cnpj:              "CNPJ",
  state:             "Estado",
  city:              "Cidade",
  charger_type:      "Tipo de carregador",
  num_chargers:      "Número de pontos",
  sector:            "Setor",
  position:          "Cargo",
  message:           "Mensagem",
  price_per_kwh:     "Preço do kWh",
  opex_pct:          "OPEX",
  projection_years:  "Anos de projeção",
};

/** Translates a single Pydantic v2 `msg` string to PT-BR. */
function translateMsg(raw: string): string {
  const s = raw.trim();

  // Email
  if (/value is not a valid email address/i.test(s)) return "E-mail inválido";

  // Required
  if (/^field required$/i.test(s)) return "Campo obrigatório";

  // String length
  const minMatch = s.match(/String should have at least (\d+) characters?/i);
  if (minMatch) {
    const n = parseInt(minMatch[1], 10);
    return `Deve ter pelo menos ${n} caractere${n !== 1 ? "s" : ""}`;
  }
  const maxMatch = s.match(/String should have at most (\d+) characters?/i);
  if (maxMatch) {
    const n = parseInt(maxMatch[1], 10);
    return `Deve ter no máximo ${n} caractere${n !== 1 ? "s" : ""}`;
  }

  // Numeric bounds
  const gtMatch = s.match(/Input should be greater than(?: or equal to)? ([\d.]+)/i);
  if (gtMatch) return `Deve ser maior que ${gtMatch[1]}`;
  const ltMatch = s.match(/Input should be less than(?: or equal to)? ([\d.]+)/i);
  if (ltMatch) return `Deve ser menor que ${ltMatch[1]}`;

  // Type errors
  if (/value is not a valid integer/i.test(s))  return "Deve ser um número inteiro";
  if (/value is not a valid number/i.test(s))   return "Deve ser um número válido";
  if (/value is not a valid boolean/i.test(s))  return "Valor inválido";
  if (/value is not a valid uuid/i.test(s))     return "Identificador inválido";
  if (/value is not a valid url/i.test(s))      return "URL inválida";
  if (/value is not a valid date/i.test(s))     return "Data inválida";

  // Enum / literal
  if (/Input should be/i.test(s)) return "Valor não permitido";

  // Duplicates / conflicts (HTTP 409 details are plain strings, handled elsewhere)
  if (/already (exists|registered)/i.test(s))  return "Já cadastrado";
  if (/not found/i.test(s))                    return "Não encontrado";

  // Fall through — return as-is
  return s;
}

/** Formats one Pydantic v2 error entry into a PT-BR user-facing string. */
function formatEntry(e: { msg?: string; loc?: unknown[] }): string {
  const rawMsg = e.msg ?? "";
  const msg    = translateMsg(rawMsg);

  // Resolve the deepest meaningful loc segment (skip "body")
  const fieldKey = Array.isArray(e.loc)
    ? e.loc
        .map(String)
        .filter((s) => s !== "body")
        .pop()
    : undefined;

  const fieldLabel = fieldKey ? (FIELD_PT[fieldKey] ?? fieldKey) : undefined;
  return fieldLabel ? `${fieldLabel}: ${msg}` : msg;
}

/**
 * Extracts a human-readable PT-BR string from a FastAPI / Pydantic v2 error.
 *
 * FastAPI 422 responses return `detail` as an array:
 *   [{ type, loc, msg, input, ctx }, ...]
 *
 * This helper collapses that into a plain string so callers never have to
 * worry about passing an object to toast.error() or rendering it as a child.
 */
export function apiErrMsg(err: unknown, fallback = "Ocorreu um erro inesperado"): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;

  if (!detail) return fallback;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const joined = (detail as Array<{ msg?: string; loc?: unknown[] }>)
      .map((e) => (typeof e === "string" ? translateMsg(e) : formatEntry(e)))
      .join("; ");
    return joined || fallback;
  }

  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Auth endpoints that should never trigger the refresh interceptor
const AUTH_BYPASS = ["/auth/refresh", "/auth/login", "/auth/register"];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    // ── Normalize Pydantic v2 validation errors ───────────────────────────────
    // FastAPI 422 returns detail as Array<{type,loc,msg,input,ctx}>.
    // Translate and collapse to a PT-BR string so every caller receives a
    // plain message without needing to know the Pydantic v2 format.
    if (error.response?.data?.detail && Array.isArray(error.response.data.detail)) {
      error.response.data.detail = (
        error.response.data.detail as Array<{ msg?: string; loc?: unknown[] }>
      )
        .map((e) => (typeof e === "string" ? translateMsg(e) : formatEntry(e)))
        .join("; ");
    }

    // ── Auto-refresh on 401 ───────────────────────────────────────────────────
    const original       = error.config;
    const isAuthEndpoint = AUTH_BYPASS.some((path) => original?.url?.includes(path));

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const { data } = await axios.post(
          "/api/v1/auth/refresh",
          {},
          { withCredentials: true }
        );
        setToken(data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        setToken(null);
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/register")
        ) {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
