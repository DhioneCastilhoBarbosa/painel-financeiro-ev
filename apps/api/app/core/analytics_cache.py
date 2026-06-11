"""Cache de analytics: versionamento por organização + chave de DataFrame.

O cache do DataFrame (em analytics._load_df) inclui a "versão" da org na chave.
Para invalidar todo o cache de uma org basta incrementar a versão — não é preciso
varrer/excluir chaves. Chamar `bump_analytics_cache` sempre que os dados de
sessão da org mudarem (upload, exclusão ou reprocessamento de arquivo).
"""

from __future__ import annotations

import hashlib

from app.core.redis import get_redis

_VER_PREFIX = "analytics:ver:"

# TTL do DataFrame em cache (segundos). Curto para refletir mudanças rápido,
# mas suficiente para cobrir a rajada de endpoints disparada por uma página.
DF_CACHE_TTL = 120


def _ver_key(organization_id) -> str:
    return f"{_VER_PREFIX}{organization_id}"


async def get_version(organization_id) -> str:
    """Versão atual do cache de analytics da org (string). Falha → '0'."""
    try:
        v = await get_redis().get(_ver_key(organization_id))
        return v or "0"
    except Exception:
        return "0"


async def bump_analytics_cache(organization_id) -> None:
    """Invalida o cache de analytics da org (async — uso na API)."""
    try:
        await get_redis().incr(_ver_key(organization_id))
    except Exception:
        pass


def bump_analytics_cache_sync(organization_id, redis_url: str) -> None:
    """Invalida o cache de analytics da org (síncrono — uso em workers Celery)."""
    try:
        import redis as _redis

        client = _redis.from_url(redis_url)
        try:
            client.incr(_ver_key(organization_id))
        finally:
            client.close()
    except Exception:
        pass


def df_cache_key(organization_id, version: str, **filters) -> str:
    """Chave determinística do DataFrame em cache para (org, versão, filtros)."""
    raw = repr((str(organization_id), version, sorted(filters.items())))
    return "analytics:df:" + hashlib.sha1(raw.encode()).hexdigest()
