"""
CRUD de alertas configuráveis por organização.
Avaliação dos alertas é feita via POST /evaluate (pode ser chamado por cron/Celery).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.alert import Alert
from app.models.user import UserRole
from app.services.audit_service import log_action

router = APIRouter()

VALID_METRICS = {"revenue_day", "revenue_session", "sessions_day", "occupancy_pct"}
VALID_OPERATORS = {"below", "above"}
VALID_CHANNELS = {"email", "in_app"}


class AlertRequest(BaseModel):
    name: str
    metric: str
    operator: str
    threshold: float
    channel: str = "email"
    is_active: bool = True


def _serialize(a: Alert) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "metric": a.metric,
        "operator": a.operator,
        "threshold": float(a.threshold),
        "channel": a.channel,
        "is_active": a.is_active,
        "last_triggered_at": a.last_triggered_at,
        "created_at": a.created_at,
    }


@router.get("")
async def list_alerts(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Alert).where(Alert.organization_id == current_user.organization_id)
    )
    return [_serialize(a) for a in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_alert(
    body: AlertRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    if body.metric not in VALID_METRICS:
        raise HTTPException(status_code=400, detail=f"Métrica inválida. Válidas: {VALID_METRICS}")
    if body.operator not in VALID_OPERATORS:
        raise HTTPException(status_code=400, detail="Operador deve ser 'below' ou 'above'")
    if body.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="Canal deve ser 'email' ou 'in_app'")

    alert = Alert(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        name=body.name,
        metric=body.metric,
        operator=body.operator,
        threshold=body.threshold,
        channel=body.channel,
        is_active=body.is_active,
    )
    db.add(alert)
    await db.flush()
    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "create_alert", "alert", str(alert.id), f"name={body.name} metric={body.metric} operator={body.operator} threshold={body.threshold}")
    return _serialize(alert)


@router.patch("/{alert_id}")
async def update_alert(
    alert_id: str,
    body: AlertRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    alert = await db.get(Alert, alert_id)
    if not alert or str(alert.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    alert.name = body.name
    alert.metric = body.metric
    alert.operator = body.operator
    alert.threshold = body.threshold
    alert.channel = body.channel
    alert.is_active = body.is_active
    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "update_alert", "alert", alert_id, f"name={body.name} metric={body.metric} operator={body.operator} threshold={body.threshold}")
    return _serialize(alert)


@router.post("/evaluate")
async def evaluate_alerts(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Avalia todos os alertas ativos da organização contra as métricas do dia atual.
    Retorna lista de alertas disparados.
    Também atualiza last_triggered_at nos alertas que disparam.
    """
    from datetime import date, timedelta

    from sqlalchemy import select as sa_select

    from app.models.charging_session import ChargingSession

    # Load yesterday's sessions (full completed day)
    yesterday = date.today() - timedelta(days=1)
    q = (
        sa_select(ChargingSession)
        .where(ChargingSession.organization_id == current_user.organization_id)
        .where(ChargingSession.started_at >= yesterday)
        .where(ChargingSession.started_at < yesterday + timedelta(days=1))
    )
    result = await db.execute(q)
    sessions = result.scalars().all()

    empty_metrics = {
        "revenue_day": 0.0,
        "revenue_session": 0.0,
        "sessions_day": 0.0,
        "occupancy_pct": 0.0,
    }
    if not sessions:
        # Still evaluate alerts against zero metrics (e.g. "below" threshold alerts can fire)
        active_alerts_result = await db.execute(
            select(Alert).where(
                Alert.organization_id == current_user.organization_id,
                Alert.is_active.is_(True),
            )
        )
        active_alerts = active_alerts_result.scalars().all()
        triggered = []
        for alert in active_alerts:
            value = empty_metrics.get(alert.metric, 0.0)
            threshold = float(alert.threshold)
            fired = (alert.operator == "below" and value < threshold) or \
                    (alert.operator == "above" and value > threshold)
            if fired:
                alert.last_triggered_at = datetime.now(UTC)
                triggered.append({
                    "id": str(alert.id),
                    "name": alert.name,
                    "metric": alert.metric,
                    "operator": alert.operator,
                    "threshold": threshold,
                    "current_value": round(value, 2),
                    "channel": alert.channel,
                })
        await db.flush()
        return {
            "triggered": triggered,
            "evaluated_at": datetime.now(UTC).isoformat(),
            "metrics": empty_metrics,
        }

    records = [
        {
            "revenue_total": float(s.revenue_total or 0),
            "is_paid": s.is_paid,
            "duration_minutes": s.duration_minutes or 0,
        }
        for s in sessions
    ]
    df = __import__("pandas").DataFrame(records)

    # Compute metrics
    paid = df[df["is_paid"]]
    metrics = {
        "revenue_day": float(paid["revenue_total"].sum()),
        "revenue_session": float(paid["revenue_total"].mean()) if len(paid) > 0 else 0.0,
        "sessions_day": float(len(df)),
        "occupancy_pct": float(
            (paid["duration_minutes"].sum() / (24 * 60) * 100) if len(paid) > 0 else 0.0
        ),
    }

    active_alerts_result = await db.execute(
        select(Alert).where(
            Alert.organization_id == current_user.organization_id,
            Alert.is_active.is_(True),
        )
    )
    active_alerts = active_alerts_result.scalars().all()

    triggered = []
    for alert in active_alerts:
        value = metrics.get(alert.metric, 0.0)
        threshold = float(alert.threshold)
        fired = (alert.operator == "below" and value < threshold) or \
                (alert.operator == "above" and value > threshold)
        if fired:
            alert.last_triggered_at = datetime.now(UTC)
            triggered.append({
                "id": str(alert.id),
                "name": alert.name,
                "metric": alert.metric,
                "operator": alert.operator,
                "threshold": threshold,
                "current_value": round(value, 2),
                "channel": alert.channel,
            })

    await db.flush()
    return {"triggered": triggered, "evaluated_at": datetime.now(UTC).isoformat(), "metrics": metrics}


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    alert = await db.get(Alert, alert_id)
    if not alert or str(alert.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "delete_alert", "alert", alert_id, f"name={alert.name}")
    await db.delete(alert)
