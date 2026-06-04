"""
Celery task para avaliação periódica de alertas.

Roda diariamente às 06h (America/Sao_Paulo) e avalia todos os alertas ativos
de todas as organizações contra as métricas do dia anterior.

Correções aplicadas:
  • Engine e Session criados no nível de módulo (não por chamada de task)
  • Cooldown de 24h: alertas já disparados ontem não re-disparam
  • Envia e-mail de notificação quando um alerta é acionado
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache as _lru_cache

import pandas as pd
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.alert import Alert
from app.models.charging_session import ChargingSession
from app.models.organization import Organization
from app.models.user import User
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _sync_db_url() -> str:
    url = settings.database_url
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    url = url.replace("postgresql+asyncpg:", "postgresql+psycopg2:")
    return url


@_lru_cache(maxsize=1)
def _get_session_factory() -> sessionmaker:
    """
    Engine criado UMA vez por processo (lru_cache).
    Lazy: não falha no import — só conecta na primeira execução de task.
    """
    engine = create_engine(
        _sync_db_url(),
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
        pool_timeout=30,
    )
    return sessionmaker(bind=engine)


# ── Labels e formatação ────────────────────────────────────────────────────────
_METRIC_LABELS: dict[str, str] = {
    "revenue_day": "Receita do dia",
    "revenue_session": "Receita por sessão",
    "sessions_day": "Sessões do dia",
    "occupancy_pct": "Ocupação (%)",
}

_OPERATOR_LABELS: dict[str, str] = {
    "below": "abaixo de",
    "above": "acima de",
}

_CURRENCY_METRICS = {"revenue_day", "revenue_session"}

ALERT_COOLDOWN_HOURS = 24


def _fmt_value(metric: str, value: float) -> str:
    if metric in _CURRENCY_METRICS:
        return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if metric == "occupancy_pct":
        return f"{value:.1f}%"
    return f"{value:.0f}"


def _send_alert_email(
    to: str,
    alert_name: str,
    metric: str,
    operator: str,
    threshold: float,
    value: float,
    org_name: str,
    evaluation_date: date,
) -> None:
    """Envia e-mail de alerta disparado (chamada síncrona)."""
    try:
        from app.services.email import send_alert_triggered_email_sync

        send_alert_triggered_email_sync(
            to=to,
            alert_name=alert_name,
            metric_label=_METRIC_LABELS.get(metric, metric),
            operator_label=_OPERATOR_LABELS.get(operator, operator),
            threshold_fmt=_fmt_value(metric, threshold),
            value_fmt=_fmt_value(metric, value),
            org_name=org_name,
            evaluation_date=str(evaluation_date),
        )
    except Exception as exc:
        logger.error("Falha ao enviar e-mail de alerta '%s': %s", alert_name, exc)


# ─────────────────────────────────────────────────────────────────────────────


def _compute_metrics(org_id, yesterday: date) -> dict:
    with _get_session_factory()() as db:
        rows = (
            db.execute(
                select(ChargingSession).where(
                    ChargingSession.organization_id == org_id,
                    ChargingSession.started_at >= yesterday,
                    ChargingSession.started_at < yesterday + timedelta(days=1),
                )
            )
            .scalars()
            .all()
        )

    if not rows:
        return {
            "revenue_day": 0.0,
            "revenue_session": 0.0,
            "sessions_day": 0.0,
            "occupancy_pct": 0.0,
        }

    records = [
        {
            "revenue_total": float(r.revenue_total or 0),
            "is_paid": r.is_paid,
            "duration_minutes": r.duration_minutes or 0,
        }
        for r in rows
    ]
    df = pd.DataFrame(records)
    paid = df[df["is_paid"]]
    revenue_day = float(paid["revenue_total"].sum())
    sessions_day = float(len(paid))
    revenue_session = revenue_day / sessions_day if sessions_day > 0 else 0.0
    occupancy_pct = float(df["duration_minutes"].sum() / (24 * 60) * 100)

    return {
        "revenue_day": revenue_day,
        "revenue_session": revenue_session,
        "sessions_day": sessions_day,
        "occupancy_pct": occupancy_pct,
    }


@celery_app.task(name="app.workers.tasks_alerts.evaluate_all_organizations")
def evaluate_all_organizations():
    """Avalia alertas de todas as organizações contra os dados de ontem."""
    yesterday = date.today() - timedelta(days=1)
    now = datetime.now(UTC)
    cooldown = timedelta(hours=ALERT_COOLDOWN_HOURS)

    with _get_session_factory()() as db:
        orgs = db.execute(select(Organization.id, Organization.name)).all()

    triggered_total = 0

    for org_id, org_name in orgs:
        try:
            metrics = _compute_metrics(org_id, yesterday)

            with _get_session_factory()() as db:
                alerts = (
                    db.execute(
                        select(Alert).where(
                            Alert.organization_id == org_id,
                            Alert.is_active.is_(True),
                        )
                    )
                    .scalars()
                    .all()
                )

                for alert in alerts:
                    # ── Cooldown: não re-dispara se já foi acionado nas últimas 24h ──
                    if alert.last_triggered_at and (now - alert.last_triggered_at) < cooldown:
                        continue

                    value = metrics.get(alert.metric, 0.0)
                    threshold = float(alert.threshold)
                    fired = (alert.operator == "below" and value < threshold) or (
                        alert.operator == "above" and value > threshold
                    )

                    if not fired:
                        continue

                    alert.last_triggered_at = now
                    triggered_total += 1

                    # ── Notificar por e-mail se canal == "email" ───────────────────
                    if alert.channel == "email":
                        creator = db.get(User, alert.created_by)
                        if creator and creator.email:
                            _send_alert_email(
                                to=creator.email,
                                alert_name=alert.name,
                                metric=alert.metric,
                                operator=alert.operator,
                                threshold=threshold,
                                value=value,
                                org_name=org_name,
                                evaluation_date=yesterday,
                            )

                db.commit()

        except Exception as exc:
            logger.error("[evaluate_all_organizations] org=%s error: %s", org_id, exc)

    return {
        "evaluated_orgs": len(orgs),
        "triggered": triggered_total,
        "date": str(yesterday),
    }
