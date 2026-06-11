import redis.asyncio as aioredis

from app.core.config import settings

_pool: aioredis.Redis | None = None
_bin_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _pool


def get_redis_bin() -> aioredis.Redis:
    """Cliente Redis em modo binário (decode_responses=False) — para valores
    serializados com pickle (ex.: cache de DataFrames), onde preservar bytes/
    dtypes é essencial."""
    global _bin_pool
    if _bin_pool is None:
        _bin_pool = aioredis.from_url(settings.redis_url, decode_responses=False)
    return _bin_pool


async def close_redis() -> None:
    global _pool, _bin_pool
    if _pool:
        await _pool.aclose()
        _pool = None
    if _bin_pool:
        await _bin_pool.aclose()
        _bin_pool = None
