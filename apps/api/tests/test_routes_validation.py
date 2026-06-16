"""
Validação estática das rotas FastAPI.

Garante que rotas com status_code=204 não têm response_model nem schema
de resposta definidos, prevenindo o erro de startup do Starlette:

    AssertionError: Status code 204 must not have a response body

Estes testes não precisam de banco de dados nem de servidor HTTP —
inspecionam apenas o objeto `app` em memória.
"""
from __future__ import annotations

import inspect

from fastapi.routing import APIRoute


def _collect_204_violations() -> list[str]:
    """Percorre todas as APIRoutes e retorna descrições de violações 204."""
    from app.main import app

    violations: list[str] = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.status_code != 204:
            continue

        methods = ", ".join(sorted(route.methods or []))

        try:
            source_file = inspect.getfile(route.endpoint)
        except (TypeError, OSError):
            source_file = "<desconhecido>"

        # ── 1. response_model explícito ou inferido da anotação de retorno ──
        if route.response_model is not None:
            violations.append(
                f"Rota {methods} {route.path} usa status_code=204 mas possui "
                f"response_model={route.response_model!r}. "
                f"Arquivo: {source_file}"
            )

        # ── 2. Schema definido no dicionário responses para o código 204 ──────
        if route.responses:
            schema_204 = route.responses.get(204, {})
            if schema_204.get("model") or schema_204.get("content"):
                violations.append(
                    f"Rota {methods} {route.path} usa status_code=204 mas define "
                    f"schema em responses[204]. "
                    f"Arquivo: {source_file}"
                )

    return violations


def test_no_204_routes_return_body() -> None:
    """
    Nenhuma rota com HTTP 204 pode ter response_model ou schema de corpo.

    FastAPI tentará serializar o retorno e o Starlette lançará em runtime:
        AssertionError: Status code 204 must not have a response body

    Como adicionar uma rota 204 corretamente:

        @router.delete("/{id}", status_code=204)
        async def delete_item(id: str, ...) -> None:
            await db.delete(item)
            # não retorne nada — o FastAPI envia 204 sem corpo automaticamente

    O que NÃO fazer (este teste falhará):

        @router.delete("/{id}", status_code=204, response_model=ItemOut)
        async def delete_item(id: str, ...) -> ItemOut:
            ...
    """
    violations = _collect_204_violations()

    assert not violations, (
        "Rotas com HTTP 204 que retornariam corpo de resposta "
        "(causa AssertionError no Starlette):\n"
        + "\n".join(f"  • {v}" for v in violations)
    )
