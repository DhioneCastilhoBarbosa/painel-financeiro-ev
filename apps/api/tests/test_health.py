"""Testes do endpoint de health check."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_liveness(client: AsyncClient):
    """Liveness probe deve sempre responder 200."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_detailed_structure(client: AsyncClient):
    """Readiness probe deve retornar estrutura com checks de DB e Redis."""
    resp = await client.get("/health/detailed")
    # Pode ser 200 (ok) ou 503 (degraded) — ambos são respostas válidas da API
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "status" in data
    assert "checks" in data
    assert "database" in data["checks"]
    assert "redis" in data["checks"]
    # Cada check deve ter um campo "status"
    assert data["checks"]["database"]["status"] in ("ok", "error")
    assert data["checks"]["redis"]["status"] in ("ok", "error")


@pytest.mark.asyncio
async def test_health_detailed_db_ok(client: AsyncClient):
    """Com banco de testes disponível, database deve ser 'ok'."""
    resp = await client.get("/health/detailed")
    data = resp.json()
    assert data["checks"]["database"]["status"] == "ok"
    assert "latency_ms" in data["checks"]["database"]
