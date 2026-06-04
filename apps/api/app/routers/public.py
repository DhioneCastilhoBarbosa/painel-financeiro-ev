"""
Router público — sem autenticação.
Endpoints usados pela landing page de captura de leads.

Segurança aplicada:
  - Rate-limit por IP em todos os endpoints de escrita
  - Validação de charger_type contra configuração ativa
  - specialist-message: idempotente (não sobrescreve se já existir) + rate-limit
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.ratelimit import limiter
from app.models.lead import Lead
from app.models.lead_notification_email import LeadNotificationEmail
from app.models.simulator_config import DEFAULT_CHARGER_CONFIGS, SimulatorConfig
from app.schemas.lead import (
    EnterpriseContactRequest,
    LeadRequest,
    LeadResponse,
    SpecialistMessageRequest,
)
from app.services.email import (
    send_lead_confirmation_email,
    send_lead_notification_email,
    send_specialist_contact_notification,
)
from app.services.simulator import run_simulation, run_simulation_multi

router = APIRouter()


# ─── Helper ───────────────────────────────────────────────────────────────────


async def _get_config(db: AsyncSession) -> dict:
    result = await db.execute(
        select(SimulatorConfig).where(SimulatorConfig.is_active.is_(True)).limit(1)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        return {
            "charger_configs": cfg.charger_configs,
            "price_per_kwh": cfg.price_per_kwh,
            "opex_pct": cfg.opex_pct,
            "growth_pct_month": cfg.growth_pct_month,
            "discount_rate_annual": cfg.discount_rate_annual,
            "projection_years": cfg.projection_years,
        }
    return {
        "charger_configs": DEFAULT_CHARGER_CONFIGS,
        "price_per_kwh": 0.85,
        "opex_pct": 0.25,
        "growth_pct_month": 0.03,
        "discount_rate_annual": 0.12,
        "projection_years": 5,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get(
    "/config",
    summary="Configuração pública do simulador",
    description=(
        "Retorna os tipos de carregador disponíveis (potência, CAPEX estimado, sessões médias/dia) "
        "e o preço do kWh configurado pelo operador da plataforma. "
        "Usado pela landing page para popular o seletor de carregadores. "
        "\n\n**Sem autenticação.** Rate limit: 60 req/min por IP."
    ),
    response_description="Lista de carregadores e parâmetros de simulação",
)
@limiter.limit("60/minute")
async def get_public_config(request: Request, db: AsyncSession = Depends(get_db)):
    """Retorna tipos de carregadores disponíveis para o simulador."""
    config = await _get_config(db)
    charger_types = [
        {
            "key": k,
            "label": k,
            "power_kw": v["power_kw"],
            "price_brl": v["price_brl"],
            "avg_sessions_day": v["avg_sessions_day"],
            "avg_duration_min": v["avg_duration_min"],
        }
        for k, v in config["charger_configs"].items()
    ]
    return {"charger_types": charger_types, "price_per_kwh": config["price_per_kwh"]}


@router.post(
    "/simulate",
    response_model=LeadResponse,
    summary="Simular retorno de investimento e capturar lead",
    description=(
        "Endpoint central da landing page. Recebe os dados do interessado e do projeto, "
        "executa a simulação financeira (CAPEX, receita mensal, payback, TIR, VPL em 5 anos) "
        "e persiste o lead no CRM.\n\n"
        "**Ações automáticas:**\n"
        "- E-mail de confirmação enviado ao lead com os resultados\n"
        "- Notificação enviada aos e-mails de alerta configurados (filtros por estado)\n"
        "- `charger_type` validado contra os tipos ativos no `GET /config`\n\n"
        "**Sem autenticação.** Rate limit: 10 req/min · 50 req/hora por IP."
    ),
    responses={
        200: {"description": "Simulação realizada com sucesso. Retorna lead_id e resultados."},
        422: {"description": "Tipo de carregador inválido ou campos obrigatórios ausentes"},
        429: {"description": "Rate limit excedido"},
    },
)
@limiter.limit("10/minute;50/hour")
async def submit_lead(
    body: LeadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Captura lead, executa simulação e envia e-mails."""
    config = await _get_config(db)

    valid_types = set(config["charger_configs"].keys())

    # ── Modo multi-carregador (charger_items presente) ──────────────────────
    if body.charger_items:
        invalid = [i.charger_type for i in body.charger_items if i.charger_type not in valid_types]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Tipo(s) de carregador inválido(s): {', '.join(invalid)}. "
                f"Opções: {', '.join(sorted(valid_types))}",
            )
        items = [
            {"charger_type": i.charger_type, "num_chargers": i.num_chargers}
            for i in body.charger_items
        ]
        sim = run_simulation_multi(items, config)
        lead_charger_type = sim.pop("charger_type_label", sim["charger_type"])[:50]
        lead_num_chargers = sim["num_chargers"]

    # ── Modo legado — tipo único ─────────────────────────────────────────────
    else:
        if body.charger_type not in valid_types:
            raise HTTPException(
                status_code=422,
                detail=f"Tipo de carregador inválido. Opções: {', '.join(sorted(valid_types))}",
            )
        sim = run_simulation(body.charger_type, body.num_chargers, config)
        lead_charger_type = body.charger_type
        lead_num_chargers = body.num_chargers

    ip = request.client.host if request.client else None

    lead = Lead(
        id=uuid.uuid4(),
        name=body.name,
        cnpj=body.cnpj,
        email=body.email,
        phone=body.phone,
        state=body.state,
        city=body.city,
        charger_type=lead_charger_type,
        sector=body.sector,
        position=body.position,
        num_chargers=lead_num_chargers,
        message=body.message,
        simulation_result=sim,
        ip_address=ip,
    )
    db.add(lead)
    await db.flush()

    # E-mail para o lead
    await send_lead_confirmation_email(body.email, body.name, sim, body.message)

    # Notificações para administradores — filtra por estado se configurado
    notif_result = await db.execute(
        select(LeadNotificationEmail).where(LeadNotificationEmail.is_active.is_(True))
    )
    for notif in notif_result.scalars():
        if notif.states and body.state not in notif.states:
            continue
        await send_lead_notification_email(
            notif.email,
            body.name,
            body.email,
            body.phone,
            body.state,
            body.city,
            lead_charger_type,
            body.sector,
            body.position,
            lead_num_chargers,
            sim,
            cnpj=body.cnpj,
            message=body.message,
        )

    return LeadResponse(lead_id=str(lead.id), simulation=sim)


@router.post("/leads/{lead_id}/specialist-message")
@limiter.limit("5/minute;20/hour")
async def add_specialist_message(
    lead_id: str,
    body: SpecialistMessageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Salva mensagem ao especialista no lead e notifica administradores.

    Regras de segurança:
    - Rate-limit por IP (5/min, 20/hora) — evita spam
    - Idempotente: se a mensagem já foi enviada, retorna 409.
      O usuário só pode enviar uma mensagem por lead; para alterar,
      deve entrar em contato diretamente.
    """
    # UUID básico de formato válido antes de bater no banco
    try:
        uuid.UUID(lead_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail="Lead não encontrado") from err

    lead = await db.get(Lead, lead_id)
    if not lead:
        # Retorna 404 genérico — não diferencia "não existe" de "uuid inválido"
        # para evitar enumeração de leads por força bruta
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    if lead.specialist_message:
        # Já existe mensagem — rejeita sobrescrita via endpoint público
        raise HTTPException(
            status_code=409,
            detail="Mensagem já registrada. Entre em contato diretamente para alterações.",
        )

    lead.specialist_message = body.message
    await db.flush()

    # Notifica admins (com filtro de estado)
    notif_result = await db.execute(
        select(LeadNotificationEmail).where(LeadNotificationEmail.is_active.is_(True))
    )
    for notif in notif_result.scalars():
        if notif.states and lead.state not in notif.states:
            continue
        await send_specialist_contact_notification(
            notif.email,
            lead.name,
            lead.email,
            lead.phone,
            lead.charger_type,
            lead.sector,
            body.message,
            str(lead.id),
        )

    return {"ok": True}


@router.post("/enterprise-contact")
@limiter.limit("5/minute;20/hour")
async def enterprise_contact(
    body: EnterpriseContactRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Captura contatos vindos do formulário Enterprise da página /solucao.
    Cria um lead com sector='Dashboard Financeiro' e charger_type='Plano Enterprise'.
    """
    ip = request.client.host if request.client else None

    lead = Lead(
        id=uuid.uuid4(),
        name=body.name,
        cnpj=body.cnpj,
        email=body.email,
        phone=body.phone,
        state="N/A",
        city=body.company or "N/A",  # usa empresa no campo cidade para identificação
        charger_type="Plano Enterprise",
        sector="Dashboard Financeiro",
        position=body.position,
        num_chargers=1,
        message=body.message,
        simulation_result={
            "source": "enterprise_contact",
            "company": body.company,
        },
        ip_address=ip,
    )
    db.add(lead)
    await db.flush()

    # Notifica admins
    notif_result = await db.execute(
        select(LeadNotificationEmail).where(LeadNotificationEmail.is_active.is_(True))
    )
    for notif in notif_result.scalars():
        if notif.states:  # enterprise contacts ignoram filtro de estado
            continue
        await send_lead_notification_email(
            notif.email,
            body.name,
            body.email,
            body.phone,
            "N/A",
            body.company or "N/A",
            "Plano Enterprise",
            "Dashboard Financeiro",
            body.position,
            1,
            {"source": "enterprise_contact"},
            cnpj=body.cnpj,
            message=body.message,
        )

    return {"ok": True, "lead_id": str(lead.id)}
