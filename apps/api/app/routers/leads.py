"""
Router de leads — permissões granulares via view_leads / manage_leads.

  view_leads   → leitura de leads (list, export, detail)
  manage_leads → configurações (simulator config, notification emails)

owner e admin sempre têm acesso total.
"""

import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.custom_role import CustomRole
from app.models.lead import Lead
from app.models.lead_notification_email import LeadNotificationEmail
from app.models.simulator_config import DEFAULT_CHARGER_CONFIGS, SimulatorConfig
from app.models.user import UserRole
from app.schemas.lead import (
    LeadDetail,
    LeadListItem,
    NotificationEmailRequest,
    NotificationEmailResponse,
    NotificationEmailUpdateRequest,
    SimulatorConfigRequest,
    SimulatorConfigResponse,
)

router = APIRouter()


# ─── Guards de permissão ──────────────────────────────────────────────────────

async def _check_permission(user, db: AsyncSession, perm: str) -> None:
    """Lança 403 se o usuário não tiver a permissão solicitada.

    owner e admin sempre têm acesso.
    Demais roles só têm acesso se o custom_role associado tiver perm=True.
    """
    if user.role in (UserRole.owner, UserRole.admin):
        return

    if user.custom_role_id:
        cr: CustomRole | None = await db.get(CustomRole, user.custom_role_id)
        if cr and cr.permissions.get(perm):
            return

    raise HTTPException(status_code=403, detail="Permissão insuficiente")


async def _require_view_leads(user, db: AsyncSession) -> None:
    """Permite owner/admin OU usuário com view_leads=True OU manage_leads=True."""
    if user.role in (UserRole.owner, UserRole.admin):
        return

    if user.custom_role_id:
        cr: CustomRole | None = await db.get(CustomRole, user.custom_role_id)
        if cr and (cr.permissions.get("view_leads") or cr.permissions.get("manage_leads")):
            return

    raise HTTPException(status_code=403, detail="Permissão insuficiente")


async def _require_manage_leads(user, db: AsyncSession) -> None:
    """Permite owner/admin OU usuário com manage_leads=True."""
    await _check_permission(user, db, "manage_leads")


# ─── Helper ───────────────────────────────────────────────────────────────────

def _lead_to_list_item(l: Lead) -> LeadListItem:
    sim = l.simulation_result
    return LeadListItem(
        id=l.id,
        name=l.name,
        email=l.email,
        phone=l.phone,
        cnpj=l.cnpj,
        state=l.state,
        city=l.city,
        charger_type=l.charger_type,
        sector=l.sector,
        position=l.position,
        num_chargers=l.num_chargers,
        monthly_revenue=sim.get("monthly_revenue", 0),
        payback_months=sim.get("payback_months"),
        roi_5y_pct=sim.get("roi_5y_pct", 0),
        message=l.message,
        specialist_message=l.specialist_message,
        created_at=l.created_at,
    )


# ─── Leads ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[LeadListItem], summary="Listar leads do CRM com filtros (estado, setor, tipo de carregador)")
async def list_leads(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    state: str | None = Query(None),
    sector: str | None = Query(None),
    charger_type: str | None = Query(None),
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
):
    await _require_view_leads(current_user, db)
    q = select(Lead).order_by(desc(Lead.created_at)).limit(limit).offset(offset)
    if state:
        q = q.where(Lead.state == state)
    if sector:
        q = q.where(Lead.sector == sector)
    if charger_type:
        q = q.where(Lead.charger_type == charger_type)

    result = await db.execute(q)
    return [_lead_to_list_item(l) for l in result.scalars().all()]


@router.get("/export", summary="Exportar todos os leads em CSV (para Excel / Google Sheets)")
async def export_leads_csv(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_view_leads(current_user, db)
    result = await db.execute(select(Lead).order_by(desc(Lead.created_at)))
    leads = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Data", "Nome", "CNPJ", "E-mail", "Telefone", "Estado", "Cidade",
        "Setor", "Cargo", "Carregador", "Pontos",
        "Receita/mês (R$)", "Lucro/mês (R$)",
        "Payback (meses)", "ROI 5 anos (%)", "VPL 5 anos (R$)",
        "Mensagem (formulário)", "Mensagem (especialista)",
    ])
    for l in leads:
        sim = l.simulation_result
        writer.writerow([
            l.created_at.strftime("%Y-%m-%d %H:%M"),
            l.name, l.cnpj or "", l.email, l.phone, l.state, l.city,
            l.sector, l.position, l.charger_type, l.num_chargers,
            sim.get("monthly_revenue", ""), sim.get("monthly_net", ""),
            sim.get("payback_months", ""), sim.get("roi_5y_pct", ""),
            sim.get("npv_5y", ""),
            l.message or "", l.specialist_message or "",
        ])

    output.seek(0)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=leads_{ts}.csv"},
    )


@router.get("/{lead_id}", response_model=LeadDetail)
async def get_lead(
    lead_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_view_leads(current_user, db)
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    sim = lead.simulation_result
    return LeadDetail(
        id=lead.id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        cnpj=lead.cnpj,
        state=lead.state,
        city=lead.city,
        charger_type=lead.charger_type,
        sector=lead.sector,
        position=lead.position,
        num_chargers=lead.num_chargers,
        monthly_revenue=sim.get("monthly_revenue", 0),
        payback_months=sim.get("payback_months"),
        roi_5y_pct=sim.get("roi_5y_pct", 0),
        message=lead.message,
        specialist_message=lead.specialist_message,
        created_at=lead.created_at,
        simulation_result=sim,
        ip_address=lead.ip_address,
    )


# ─── Simulator Config ─────────────────────────────────────────────────────────

@router.get("/config/simulator", response_model=SimulatorConfigResponse)
async def get_simulator_config(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    result = await db.execute(
        select(SimulatorConfig).where(SimulatorConfig.is_active == True).limit(1)
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = SimulatorConfig(id=uuid.uuid4(), charger_configs=DEFAULT_CHARGER_CONFIGS)
        db.add(cfg)
        await db.flush()
    return cfg


@router.put("/config/simulator", response_model=SimulatorConfigResponse)
async def update_simulator_config(
    body: SimulatorConfigRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    result = await db.execute(
        select(SimulatorConfig).where(SimulatorConfig.is_active == True).limit(1)
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = SimulatorConfig(id=uuid.uuid4())
        db.add(cfg)

    cfg.charger_configs = body.charger_configs
    cfg.price_per_kwh = body.price_per_kwh
    cfg.opex_pct = body.opex_pct
    cfg.growth_pct_month = body.growth_pct_month
    cfg.discount_rate_annual = body.discount_rate_annual
    cfg.projection_years = body.projection_years
    await db.flush()
    return cfg


# ─── Notification Emails ──────────────────────────────────────────────────────

@router.get("/config/notification-emails", response_model=list[NotificationEmailResponse])
async def list_notification_emails(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    result = await db.execute(select(LeadNotificationEmail))
    return result.scalars().all()


@router.post("/config/notification-emails", response_model=NotificationEmailResponse, status_code=201)
async def add_notification_email(
    body: NotificationEmailRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    existing = await db.scalar(
        select(LeadNotificationEmail).where(LeadNotificationEmail.email == body.email)
    )
    if existing:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")

    entry = LeadNotificationEmail(
        id=uuid.uuid4(),
        email=body.email,
        name=body.name,
        states=body.states,
    )
    db.add(entry)
    await db.flush()
    return entry


@router.patch("/config/notification-emails/{email_id}", response_model=NotificationEmailResponse)
async def update_notification_email(
    email_id: str,
    body: NotificationEmailUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    entry = await db.get(LeadNotificationEmail, email_id)
    if not entry:
        raise HTTPException(status_code=404, detail="E-mail não encontrado")
    if body.name is not None:
        entry.name = body.name
    if body.states is not None:
        entry.states = body.states
    if body.is_active is not None:
        entry.is_active = body.is_active
    await db.flush()
    return entry


@router.delete("/config/notification-emails/{email_id}", status_code=204)
async def remove_notification_email(
    email_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_manage_leads(current_user, db)
    entry = await db.get(LeadNotificationEmail, email_id)
    if not entry:
        raise HTTPException(status_code=404, detail="E-mail não encontrado")
    await db.delete(entry)
