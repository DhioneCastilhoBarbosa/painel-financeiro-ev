"""Resolução de permissões por usuário.

Hierarquia:
  1. Se o usuário tem custom_role_id → usa as permissões do custom role.
  2. Caso contrário → usa as permissões padrão do built-in role.

owner / admin têm todas as permissões sempre.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.custom_role import CustomRole
    from app.models.user import User

ALL_PERMISSIONS = [
    "view_dashboard",  # Dashboard / KPIs / séries temporais
    "view_stations",  # Estações & Conectores
    "view_users",  # Análise de usuários
    "view_investment",  # Análise de investimento
    "import_files",  # Importar arquivos
    "delete_files",  # Excluir arquivos
    "manage_alerts",  # Configurar alertas
    "manage_settings",  # Configurações e custos
    "manage_team",  # Convidar / remover membros
    "view_billing",  # Cobrança e plano
    "view_audit",  # Log de auditoria
    # ── Leads (simulador público / CRM) ────────────────────────────────────
    "view_leads",  # Ver lista de leads e exportar
    "manage_leads",  # Configurar simulador e e-mails de notificação
]

# Permissões padrão por built-in role
BUILTIN_DEFAULTS: dict[str, dict[str, bool]] = {
    "owner": {p: True for p in ALL_PERMISSIONS},
    "admin": {p: True for p in ALL_PERMISSIONS},
    "analyst": {
        "view_dashboard": True,
        "view_stations": True,
        "view_users": True,
        "view_investment": True,
        "import_files": True,
        "delete_files": False,
        "manage_alerts": False,
        "manage_settings": False,
        "manage_team": False,
        "view_billing": False,
        "view_audit": False,
        "view_leads": False,
        "manage_leads": False,
    },
    "viewer": {
        "view_dashboard": True,
        "view_stations": True,
        "view_users": True,
        "view_investment": True,
        "import_files": False,
        "delete_files": False,
        "manage_alerts": False,
        "manage_settings": False,
        "manage_team": False,
        "view_billing": False,
        "view_audit": False,
        "view_leads": False,
        "manage_leads": False,
    },
}


def resolve_permissions(user: User, custom_role: CustomRole | None = None) -> dict[str, bool]:
    """Retorna dict completo de permissões para o usuário."""
    # owner e admin sempre têm tudo, independente de custom role
    if user.role in ("owner", "admin"):
        return {p: True for p in ALL_PERMISSIONS}

    if custom_role is not None:
        stored: dict = custom_role.permissions or {}
        # garante que todos os campos existam (preenche faltantes com False)
        return {p: bool(stored.get(p, False)) for p in ALL_PERMISSIONS}

    return dict(BUILTIN_DEFAULTS.get(str(user.role), BUILTIN_DEFAULTS["viewer"]))
