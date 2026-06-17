"""
Gerenciamento de configurações de planos.

As configurações são armazenadas em app/data/plan_configs.json.
Se o arquivo não existir (primeiro deploy / container limpo), usa os defaults
embutidos e cria o arquivo automaticamente para edições futuras.

Flags de feature_flags: presença ausente no JSON é resolvida via merge com
os defaults embutidos — garantindo que novas flags sejam retrocompatíveis.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parent.parent / "data"
_DATA_PATH = _DATA_DIR / "plan_configs.json"
_lock = threading.Lock()

# ─── Defaults embutidos ──────────────────────────────────────────────────────


def _plan(
    id: str,
    name: str,
    price_brl: int,
    price_label: str,
    max_users: int,
    max_files: int,
    is_public: bool,
    features: list[str],
    flags: dict[str, bool],
) -> dict[str, Any]:
    return {
        "id": id,
        "name": name,
        "price_brl": price_brl,
        "price_label": price_label,
        "max_users": max_users,
        "max_files": max_files,
        "is_public": is_public,
        "stripe_price_id": None,
        "features": features,
        "feature_flags": flags,
    }


_ALL_FLAGS_OFF: dict[str, bool] = {
    "dashboard_overview": False,
    "revenue": False,
    "stations": False,
    "users_analytics": False,
    "dre": False,
    "investment_simple": False,
    "investment_advanced": False,
    "capex": False,
    "pdf_report": False,
    "files": False,
    "leads": False,
    "team": False,
    "billing": False,
    "settings": False,
    "map_view": False,
    "csv_export": False,
    "pdf_export": False,
    "api_access": False,
    "priority_support": False,
}

_DEFAULTS: dict[str, Any] = {
    "plans": [
        _plan(
            id="trial",
            name="Trial",
            price_brl=0,
            price_label="Gratuito",
            max_users=3,
            max_files=5,
            is_public=False,
            features=[
                "3 usuários",
                "5 arquivos de dados",
                "Análise de Investimento Simplificada",
                "Suporte por e-mail",
            ],
            flags={
                **_ALL_FLAGS_OFF,
                "investment_simple": True,
            },
        ),
        _plan(
            id="starter",
            name="Starter",
            price_brl=19700,
            price_label="R$ 197/mês",
            max_users=3,
            max_files=5,
            is_public=True,
            features=[
                "3 usuários",
                "5 arquivos de dados",
                "Todos os dashboards (exceto Mapa EV)",
                "Análise de Investimento Simplificada",
                "Exportação CSV",
                "Suporte por e-mail",
            ],
            flags={
                **_ALL_FLAGS_OFF,
                "dashboard_overview": True,
                "revenue": True,
                "stations": True,
                "users_analytics": True,
                "dre": True,
                "investment_simple": True,
                "capex": True,
                "files": True,
                "team": True,
                "billing": True,
                "settings": True,
                "csv_export": True,
            },
        ),
        _plan(
            id="pro",
            name="Pro",
            price_brl=49700,
            price_label="R$ 497/mês",
            max_users=10,
            max_files=30,
            is_public=True,
            features=[
                "10 usuários",
                "30 arquivos de dados",
                "Todos os dashboards + Mapa de Instalação EV",
                "Análise Simplificada e Avançada (VPL, TIR, sensibilidade)",
                "Relatório PDF",
                "Leads (CRM)",
                "Exportação CSV + PDF",
                "Suporte prioritário",
            ],
            flags={
                **_ALL_FLAGS_OFF,
                "dashboard_overview": True,
                "revenue": True,
                "stations": True,
                "users_analytics": True,
                "dre": True,
                "investment_simple": True,
                "investment_advanced": True,
                "capex": True,
                "pdf_report": True,
                "files": True,
                "leads": True,
                "team": True,
                "billing": True,
                "settings": True,
                "map_view": True,
                "csv_export": True,
                "pdf_export": True,
                "priority_support": True,
            },
        ),
        _plan(
            id="enterprise",
            name="Enterprise",
            price_brl=0,
            price_label="Sob consulta",
            max_users=9999,
            max_files=9999,
            is_public=False,
            features=[
                "Usuários ilimitados",
                "Arquivos ilimitados",
                "Todos os módulos",
                "Análise Avançada completa",
                "Mapa de Instalação EV",
                "Leads (CRM)",
                "Acesso à API",
                "Suporte dedicado",
                "SLA garantido",
            ],
            flags={k: True for k in _ALL_FLAGS_OFF},
        ),
        _plan(
            id="free",
            name="Free",
            price_brl=0,
            price_label="Gratuito",
            max_users=1,
            max_files=1,
            is_public=False,
            features=["1 usuário", "1 arquivo", "Análise de Investimento Simplificada"],
            flags={
                **_ALL_FLAGS_OFF,
                "investment_simple": True,
            },
        ),
    ],
    "available_features": [
        {"key": "dashboard_overview", "label": "Visão Geral"},
        {"key": "revenue", "label": "Receita (Série Temporal)"},
        {"key": "stations", "label": "Estações"},
        {"key": "users_analytics", "label": "Usuários"},
        {"key": "dre", "label": "DRE"},
        {"key": "investment_simple", "label": "Análise de Investimento — Simplificada"},
        {"key": "investment_advanced", "label": "Análise de Investimento — Avançada"},
        {"key": "capex", "label": "CAPEX por Carregador"},
        {"key": "pdf_report", "label": "Relatório PDF"},
        {"key": "files", "label": "Arquivos"},
        {"key": "leads", "label": "Leads (CRM)"},
        {"key": "team", "label": "Equipe"},
        {"key": "billing", "label": "Plano & Cobrança"},
        {"key": "settings", "label": "Configurações"},
        {"key": "map_view", "label": "Mapa de Instalação EV"},
        {"key": "csv_export", "label": "Exportação CSV"},
        {"key": "pdf_export", "label": "Exportação PDF"},
        {"key": "api_access", "label": "Acesso à API"},
        {"key": "priority_support", "label": "Suporte prioritário"},
    ],
}

# ─── I/O ─────────────────────────────────────────────────────────────────────


def _load() -> dict[str, Any]:
    """Lê sempre do arquivo (sem cache em memória) para que múltiplos workers
    vejam imediatamente qualquer atualização salva por outro worker."""
    with _lock:
        if _DATA_PATH.exists():
            try:
                with open(_DATA_PATH, encoding="utf-8") as f:
                    return json.load(f)
            except Exception as exc:
                logger.warning("plan_configs.json inválido (%s) — usando defaults", exc)

        import copy

        data = copy.deepcopy(_DEFAULTS)
        _try_seed(data)
        return data


def _try_seed(data: dict[str, Any]) -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info("plan_configs.json criado em %s", _DATA_PATH)
    except Exception as exc:
        logger.warning("Não foi possível persistir plan_configs.json: %s", exc)


def _save(data: dict[str, Any]) -> None:
    try:
        with _lock:
            _DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(_DATA_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info("plan_configs.json salvo em %s", _DATA_PATH)
    except OSError as exc:
        logger.error("Falha ao salvar plan_configs.json: %s", exc)
        raise RuntimeError(
            f"Não foi possível persistir configuração dos planos ({exc}). "
            "Verifique as permissões do diretório /app/app/data/."
        ) from exc


def _default_flags(plan_id: str) -> dict[str, bool]:
    """Retorna os feature_flags default para um plano."""
    dp = next((p for p in _DEFAULTS["plans"] if p["id"] == plan_id), None)
    return dp["feature_flags"].copy() if dp else {}


# ─── API pública ─────────────────────────────────────────────────────────────


def get_all_plans() -> list[dict[str, Any]]:
    plans = _load()["plans"]
    # Merge: garante que novas flags defaults apareçam mesmo em JSON antigo
    result = []
    for p in plans:
        merged_flags = {**_default_flags(p["id"]), **p.get("feature_flags", {})}
        result.append({**p, "feature_flags": merged_flags})
    return result


def get_public_plans() -> list[dict[str, Any]]:
    return [p for p in get_all_plans() if p.get("is_public")]


def get_plan(plan_id: str) -> dict[str, Any] | None:
    return next((p for p in get_all_plans() if p["id"] == plan_id), None)


def get_plan_limits(plan_id: str) -> dict[str, int]:
    plan = get_plan(plan_id)
    if not plan:
        return {"users": 3, "files": 5}
    return {"users": plan["max_users"], "files": plan["max_files"]}


def get_plan_feature_flags(plan_id: str) -> dict[str, bool]:
    plan = get_plan(plan_id)
    return plan.get("feature_flags", {}) if plan else {}


def get_available_features() -> list[dict[str, str]]:
    # Always return the canonical list from _DEFAULTS (keeps JSON config in sync)
    return _DEFAULTS["available_features"]


def update_plan(plan_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {
        "name",
        "price_brl",
        "price_label",
        "max_users",
        "max_files",
        "features",
        "feature_flags",
        "is_public",
    }
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return None

    data = _load()
    plans: list[dict[str, Any]] = data["plans"]
    idx = next((i for i, p in enumerate(plans) if p["id"] == plan_id), None)
    if idx is None:
        return None

    plans[idx].update(filtered)
    _save(data)
    # Return with merged flags so caller sees full picture
    return get_plan(plan_id)
