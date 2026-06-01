"""
Testes dos endpoints públicos (sem autenticação).
Usados pela landing page do simulador.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_public_config(client: AsyncClient):
    """Deve retornar lista de tipos de carregadores e preço do kWh."""
    resp = await client.get("/api/v1/public/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "charger_types" in data
    assert isinstance(data["charger_types"], list)
    assert len(data["charger_types"]) > 0
    assert "price_per_kwh" in data
    # Cada item deve ter campos esperados
    first = data["charger_types"][0]
    for field in ("key", "label", "power_kw", "price_brl"):
        assert field in first, f"Campo '{field}' ausente em charger_types[0]"


@pytest.mark.asyncio
async def test_simulate_success(client: AsyncClient):
    """Simulação válida deve criar lead e retornar resultados financeiros."""
    # Obtém os tipos disponíveis para usar um válido
    config_resp = await client.get("/api/v1/public/config")
    charger_key = config_resp.json()["charger_types"][0]["key"]

    payload = {
        "name":         "João Investidor",
        "cnpj":         "11.222.333/0001-81",   # CNPJ válido (dígitos fictícios mas válidos)
        "email":        "joao@empresa.com.br",
        "phone":        "(11) 99999-9999",
        "state":        "SP",
        "city":         "São Paulo",
        "charger_type": charger_key,
        "sector":       "Shopping Center / Mall",
        "position":     "Diretor / CEO",
        "num_chargers": 2,
        "message":      None,
    }
    resp = await client.post("/api/v1/public/simulate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "lead_id" in data
    assert "simulation" in data
    sim = data["simulation"]
    for field in ("monthly_revenue", "payback_months", "roi_5y_pct", "capex"):
        assert field in sim, f"Campo '{field}' ausente na simulação"
    assert sim["monthly_revenue"] > 0
    assert sim["capex"] > 0


@pytest.mark.asyncio
async def test_simulate_invalid_charger_type(client: AsyncClient):
    """Tipo de carregador inválido deve retornar 422."""
    resp = await client.post("/api/v1/public/simulate", json={
        "name":         "Teste",
        "cnpj":         "11.222.333/0001-81",
        "email":        "test@test.com",
        "phone":        "(11) 99999-9999",
        "state":        "SP",
        "city":         "São Paulo",
        "charger_type": "CARREGADOR_INEXISTENTE_XYZ",
        "sector":       "Outros",
        "position":     "Outro",
        "num_chargers": 1,
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_simulate_missing_required_fields(client: AsyncClient):
    """Campos obrigatórios ausentes devem retornar 422."""
    resp = await client.post("/api/v1/public/simulate", json={"name": "só o nome"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_billing_plans_public(client: AsyncClient):
    """Lista de planos deve ser acessível sem autenticação."""
    resp = await client.get("/api/v1/billing/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert isinstance(plans, list)
    assert len(plans) >= 2
    plan_ids = [p["id"] for p in plans]
    assert "starter" in plan_ids
    assert "pro" in plan_ids
