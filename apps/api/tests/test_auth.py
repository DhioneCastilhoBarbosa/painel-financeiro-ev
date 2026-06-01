"""Testes dos endpoints de autenticação."""
import uuid
import pytest
from httpx import AsyncClient


# ── Fixtures auxiliares ─────────────────────────────────────────────────────

def _user_payload(suffix: str | None = None) -> dict:
    s = suffix or uuid.uuid4().hex[:8]
    return {
        "name":              f"Usuário {s}",
        "email":             f"user_{s}@example.com",
        "password":          "SenhaForte123!",
        "organization_name": f"Empresa {s}",
    }


# ── Register ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json=_user_payload())
    assert resp.status_code == 201
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = _user_payload()
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409
    assert "E-mail" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    payload = _user_payload()
    payload["email"] = "nao-e-email"
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    payload = _user_payload()
    payload["password"] = "123"
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 422


# ── Login ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, registered_user: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "token_type" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, registered_user: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": "senhaerrada"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "naoexiste@example.com", "password": "qualquer"},
    )
    assert resp.status_code == 401


# ── Me ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_authenticated(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "email" in data
    assert "role" in data
    assert data["role"] == "owner"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ── Trial status ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_new_org_has_trial(client: AsyncClient, auth_headers: dict):
    """Organização recém-criada deve estar em período de trial."""
    resp = await client.get("/api/v1/billing/subscription", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["plan"] in ("trial", "trialing")
