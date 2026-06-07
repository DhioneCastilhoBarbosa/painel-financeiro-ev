"""
Gerenciamento de configurações de planos.

As configurações são armazenadas em app/data/plan_configs.json.
Se o arquivo não existir (primeiro deploy / container limpo), usa os defaults
embutidos e cria o arquivo automaticamente para edições futuras.

Limitação: o preço efetivamente cobrado pelo Stripe é separado e configurado
via STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO. O campo price_brl aqui é para
exibição e rastreamento interno.
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
_cache: dict[str, Any] | None = None
_lock = threading.Lock()

# ─── Defaults embutidos ──────────────────────────────────────────────────────
# Usados quando o JSON ainda não existe (primeiro deploy).

_DEFAULTS: dict[str, Any] = {
    "plans": [
        {
            "id": "trial",
            "name": "Trial",
            "price_brl": 0,
            "price_label": "Gratuito",
            "max_users": 3,
            "max_files": 5,
            "is_public": False,
            "stripe_price_id": None,
            "features": [
                "3 usuários",
                "5 arquivos de dados",
                "Dashboard de visão geral",
                "Exportação CSV",
                "Suporte por e-mail",
            ],
            "feature_flags": {
                "csv_export": True,
                "pdf_export": False,
                "advanced_calculator": False,
                "map_view": False,
                "api_access": False,
                "priority_support": False,
            },
        },
        {
            "id": "starter",
            "name": "Starter",
            "price_brl": 19700,
            "price_label": "R$ 197/mês",
            "max_users": 3,
            "max_files": 5,
            "is_public": True,
            "stripe_price_id": None,
            "features": [
                "3 usuários",
                "5 arquivos de dados",
                "Todos os dashboards",
                "Exportação CSV",
                "Suporte por e-mail",
            ],
            "feature_flags": {
                "csv_export": True,
                "pdf_export": False,
                "advanced_calculator": False,
                "map_view": True,
                "api_access": False,
                "priority_support": False,
            },
        },
        {
            "id": "pro",
            "name": "Pro",
            "price_brl": 49700,
            "price_label": "R$ 497/mês",
            "max_users": 10,
            "max_files": 30,
            "is_public": True,
            "stripe_price_id": None,
            "features": [
                "10 usuários",
                "30 arquivos de dados",
                "Todos os dashboards",
                "Exportação CSV + PDF",
                "Calculadora de payback avançada",
                "Mapa de instalação EV",
                "Suporte prioritário",
            ],
            "feature_flags": {
                "csv_export": True,
                "pdf_export": True,
                "advanced_calculator": True,
                "map_view": True,
                "api_access": False,
                "priority_support": True,
            },
        },
        {
            "id": "enterprise",
            "name": "Enterprise",
            "price_brl": 0,
            "price_label": "Sob consulta",
            "max_users": 9999,
            "max_files": 9999,
            "is_public": False,
            "stripe_price_id": None,
            "features": [
                "Usuários ilimitados",
                "Arquivos ilimitados",
                "Todos os dashboards",
                "Exportação CSV + PDF",
                "Calculadora de payback avançada",
                "Mapa de instalação EV",
                "Acesso à API",
                "Suporte dedicado",
                "SLA garantido",
            ],
            "feature_flags": {
                "csv_export": True,
                "pdf_export": True,
                "advanced_calculator": True,
                "map_view": True,
                "api_access": True,
                "priority_support": True,
            },
        },
        {
            "id": "free",
            "name": "Free",
            "price_brl": 0,
            "price_label": "Gratuito",
            "max_users": 1,
            "max_files": 1,
            "is_public": False,
            "stripe_price_id": None,
            "features": [
                "1 usuário",
                "1 arquivo de dados",
                "Dashboard básico",
            ],
            "feature_flags": {
                "csv_export": False,
                "pdf_export": False,
                "advanced_calculator": False,
                "map_view": False,
                "api_access": False,
                "priority_support": False,
            },
        },
    ],
    "available_features": [
        {"key": "csv_export",          "label": "Exportação CSV"},
        {"key": "pdf_export",          "label": "Exportação PDF / Relatórios"},
        {"key": "advanced_calculator", "label": "Calculadora de payback avançada"},
        {"key": "map_view",            "label": "Mapa de instalação EV"},
        {"key": "api_access",          "label": "Acesso à API"},
        {"key": "priority_support",    "label": "Suporte prioritário"},
    ],
}

# ─── I/O ─────────────────────────────────────────────────────────────────────


def _load() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache

    with _lock:
        if _cache is not None:
            return _cache

        if _DATA_PATH.exists():
            try:
                with open(_DATA_PATH, encoding="utf-8") as f:
                    _cache = json.load(f)
                return _cache
            except Exception as exc:
                logger.warning("plan_configs.json inválido (%s) — usando defaults", exc)

        # Arquivo não existe ou corrompido → usa defaults e tenta persistir
        import copy
        _cache = copy.deepcopy(_DEFAULTS)
        _try_seed()
        return _cache


def _try_seed() -> None:
    """Persiste os defaults no disco (best-effort; sem falhar se não conseguir)."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(_cache, f, indent=2, ensure_ascii=False)
        logger.info("plan_configs.json criado com defaults em %s", _DATA_PATH)
    except Exception as exc:
        logger.warning("Não foi possível persistir plan_configs.json: %s", exc)


def _save(data: dict[str, Any]) -> None:
    global _cache
    with _lock:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        _cache = data


# ─── API pública ─────────────────────────────────────────────────────────────


def get_all_plans() -> list[dict[str, Any]]:
    return _load()["plans"]


def get_public_plans() -> list[dict[str, Any]]:
    return [p for p in get_all_plans() if p.get("is_public")]


def get_plan(plan_id: str) -> dict[str, Any] | None:
    return next((p for p in get_all_plans() if p["id"] == plan_id), None)


def get_plan_limits(plan_id: str) -> dict[str, int]:
    plan = get_plan(plan_id)
    if not plan:
        return {"users": 3, "files": 5}
    return {"users": plan["max_users"], "files": plan["max_files"]}


def get_available_features() -> list[dict[str, str]]:
    return _load().get("available_features", [])


def update_plan(plan_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {
        "name", "price_brl", "price_label",
        "max_users", "max_files",
        "features", "feature_flags", "is_public",
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
    return plans[idx]
