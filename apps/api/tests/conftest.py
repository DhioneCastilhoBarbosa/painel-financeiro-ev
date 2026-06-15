"""
Fixtures compartilhadas para todos os testes.

Setup do banco de dados de teste:
  - Usa TEST_DATABASE_URL (padrão: cria banco _test baseado no DATABASE_URL do .env)
  - Cria as tabelas via SQLAlchemy Base.metadata.create_all (sem migrations)
  - Overrides o get_db do FastAPI para usar a sessão de teste

Requisitos para rodar localmente:
  1. docker compose up db redis   (sobe só os serviços de infra)
  2. pip install -r requirements-dev.txt
  3. pytest

Nota sobre NullPool:
  Testes assíncronos com asyncpg sofrem de "Future attached to a different loop"
  quando conexões do pool foram criadas em um event loop diferente do loop atual
  do teste. NullPool evita esse problema ao não reutilizar conexões — cada
  requisição abre e fecha sua própria conexão no loop corrente.
"""
from __future__ import annotations

import os
import uuid
from typing import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

# ── URL do banco de testes ──────────────────────────────────────────────────
# Por padrão usa o banco dev com sufixo _test para isolamento
_DEFAULT_TEST_DB = os.getenv("DATABASE_URL", "postgresql+asyncpg://financedash:financedash_dev@localhost:5433/financedash")
if "_test" not in _DEFAULT_TEST_DB:
    _DEFAULT_TEST_DB = _DEFAULT_TEST_DB.rstrip("/") + "_test"

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", _DEFAULT_TEST_DB)


# ── Engine de teste (criado uma vez por sessão de testes) ───────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """
    Cria o engine de teste e as tabelas; dropa ao final.

    NullPool: cada operação de banco abre uma nova conexão no loop corrente e
    fecha ao terminar. Evita o erro "Future attached to a different loop" quando
    testes assíncronos em function-scope usam conexões criadas em outro loop.
    """
    import app.models  # noqa: F401 — registers all ORM models with Base.metadata
    from app.core.database import Base

    engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Sessão de banco isolada por teste.
    Usa rollback ao final — sem poluir o banco de testes.
    """
    Session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="session")
async def client(test_engine) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient apontando para a aplicação FastAPI com o banco de testes injetado.
    Session-scoped para que o dependency override persista entre testes.
    """
    from app.core.database import get_db
    from app.main import app

    Session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def _override_get_db():
        async with Session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Helpers de autenticação ─────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def registered_user(client: AsyncClient) -> dict:
    """
    Cria e retorna um usuário registrado (uma vez por sessão de testes).
    Session-scoped para não exceder o rate limit de 5 req/min em /register.
    """
    payload = {
        "name":              "Usuário Teste",
        "email":             f"test_{uuid.uuid4().hex[:8]}@example.com",
        "password":          "SenhaForte123!",
        "organization_name": f"Org Teste {uuid.uuid4().hex[:6]}",
    }
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return payload


@pytest_asyncio.fixture(scope="session")
async def auth_headers(client: AsyncClient, registered_user: dict) -> dict:
    """Headers com Bearer token de um usuário autenticado (uma vez por sessão)."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
