"""
Gerenciamento de configurações de planos.

As configurações são armazenadas em app/data/plan_configs.json e podem ser
editadas via painel admin sem necessidade de redeploy.

Limitação: o preço efetivamente cobrado pelo Stripe é separado e configurado
nas variáveis STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO. O campo price_brl aqui
é para exibição e rastreamento interno.
"""

import json
import threading
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).parent.parent / "data" / "plan_configs.json"
_cache: dict[str, Any] | None = None
_lock = threading.Lock()


def _load() -> dict[str, Any]:
    global _cache
    if _cache is None:
        with _lock:
            if _cache is None:
                with open(_DATA_PATH, encoding="utf-8") as f:
                    _cache = json.load(f)
    return _cache


def _save(data: dict[str, Any]) -> None:
    global _cache
    with _lock:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        _cache = data


def get_all_plans() -> list[dict[str, Any]]:
    return _load()["plans"]


def get_public_plans() -> list[dict[str, Any]]:
    return [p for p in get_all_plans() if p.get("is_public")]


def get_plan(plan_id: str) -> dict[str, Any] | None:
    return next((p for p in get_all_plans() if p["id"] == plan_id), None)


def get_plan_limits(plan_id: str) -> dict[str, int]:
    plan = get_plan(plan_id)
    if not plan:
        return {"users": 1, "files": 1}
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

    data = _load()
    plans = data["plans"]
    idx = next((i for i, p in enumerate(plans) if p["id"] == plan_id), None)
    if idx is None:
        return None

    plans[idx].update(filtered)
    _save(data)
    return plans[idx]
