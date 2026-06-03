"""
Billing via Stripe.
All endpoints are no-op when STRIPE_SECRET_KEY is not configured.
Webhook endpoint handles subscription lifecycle events.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.organization import Organization
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.user import UserRole

router = APIRouter()
logger = logging.getLogger(__name__)

_stripe_available = bool(settings.stripe_secret_key)
if _stripe_available:
    import stripe as _stripe
    _stripe.api_key = settings.stripe_secret_key

PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "price_brl": 19700,  # centavos
        "price_label": "R$ 197/mês",
        "limits": {"users": 3, "files": 5},
        "features": [
            "3 usuários",
            "5 arquivos de dados",
            "Todos os dashboards",
            "Exportação CSV",
            "Suporte por e-mail",
        ],
        "stripe_price_id": settings.stripe_price_starter,
    },
    {
        "id": "pro",
        "name": "Pro",
        "price_brl": 49700,
        "price_label": "R$ 497/mês",
        "limits": {"users": 10, "files": 30},
        "features": [
            "10 usuários",
            "30 arquivos de dados",
            "Todos os dashboards",
            "Exportação CSV + PDF",
            "Calculadora de payback avançada",
            "Suporte prioritário",
        ],
        "stripe_price_id": settings.stripe_price_pro,
    },
]


@router.get("/plans")
async def list_plans():
    return PLANS


@router.get("/subscription")
async def get_subscription(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    sub = await db.scalar(
        select(Subscription).where(Subscription.organization_id == current_user.organization_id)
    )
    org = await db.get(Organization, current_user.organization_id)
    if not sub:
        return {
            "plan": "trial",
            "status": "trialing",
            "trial_ends_at": org.trial_ends_at,
            "current_period_end": None,
            "stripe_customer_id": None,
        }
    return {
        "plan": sub.plan,
        "status": sub.status,
        "trial_ends_at": org.trial_ends_at,
        "current_period_end": sub.current_period_end,
        "stripe_customer_id": sub.stripe_customer_id,
    }


@router.post("/checkout")
async def create_checkout(
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner,):
        raise HTTPException(status_code=403, detail="Apenas o proprietário pode gerenciar o plano")

    if not _stripe_available:
        raise HTTPException(status_code=503, detail="Pagamentos não configurados neste ambiente")

    body = await request.json()
    plan_id = body.get("plan")
    plan = next((p for p in PLANS if p["id"] == plan_id), None)
    if not plan or not plan["stripe_price_id"]:
        raise HTTPException(status_code=400, detail="Plano inválido ou não configurado")

    sub = await db.scalar(
        select(Subscription).where(Subscription.organization_id == current_user.organization_id)
    )
    customer_id = sub.stripe_customer_id if sub else None

    session_params: dict = {
        "mode": "subscription",
        "line_items": [{"price": plan["stripe_price_id"], "quantity": 1}],
        "success_url": f"{settings.allowed_origins.split(',')[0].strip()}/dashboard/billing?success=1",
        "cancel_url": f"{settings.allowed_origins.split(',')[0].strip()}/dashboard/billing?canceled=1",
        "metadata": {"organization_id": str(current_user.organization_id)},
        "subscription_data": {"metadata": {"organization_id": str(current_user.organization_id)}},
    }
    if customer_id:
        session_params["customer"] = customer_id
    else:
        session_params["customer_email"] = current_user.email

    import stripe as _s
    session = _s.checkout.Session.create(**session_params)
    return {"checkout_url": session.url}


@router.post("/portal")
async def create_portal(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner,):
        raise HTTPException(status_code=403, detail="Apenas o proprietário pode gerenciar o plano")

    if not _stripe_available:
        raise HTTPException(status_code=503, detail="Pagamentos não configurados neste ambiente")

    sub = await db.scalar(
        select(Subscription).where(Subscription.organization_id == current_user.organization_id)
    )
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Nenhuma assinatura ativa encontrada")

    import stripe as _s
    session = _s.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{settings.allowed_origins.split(',')[0].strip()}/dashboard/billing",
    )
    return {"portal_url": session.url}


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not _stripe_available:
        return {"received": True}

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    import stripe as _s
    try:
        event = _s.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except (_s.error.SignatureVerificationError, ValueError) as exc:
        logger.warning("Stripe webhook signature invalid: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature") from exc

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        await _handle_subscription_upsert(data, db)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data, db)
    elif event_type == "checkout.session.completed":
        # Subscription is already created by the subscription.created event
        pass

    return {"received": True}


async def _handle_subscription_upsert(stripe_sub: dict, db: AsyncSession) -> None:
    org_id_str = stripe_sub.get("metadata", {}).get("organization_id")
    if not org_id_str:
        return

    import uuid
    try:
        org_id = uuid.UUID(org_id_str)
    except ValueError:
        return

    plan_map = {
        settings.stripe_price_starter: SubscriptionPlan.starter,
        settings.stripe_price_pro: SubscriptionPlan.pro,
    }
    price_id = stripe_sub["items"]["data"][0]["price"]["id"] if stripe_sub.get("items") else None
    plan = plan_map.get(price_id, SubscriptionPlan.starter)

    status_map = {
        "active": SubscriptionStatus.active,
        "past_due": SubscriptionStatus.past_due,
        "canceled": SubscriptionStatus.canceled,
        "trialing": SubscriptionStatus.trialing,
    }
    sub_status = status_map.get(stripe_sub["status"], SubscriptionStatus.active)

    sub = await db.scalar(select(Subscription).where(Subscription.organization_id == org_id))
    if not sub:
        sub = Subscription(organization_id=org_id)
        db.add(sub)

    sub.stripe_customer_id = stripe_sub["customer"]
    sub.stripe_subscription_id = stripe_sub["id"]
    sub.plan = plan
    sub.status = sub_status
    if stripe_sub.get("current_period_start"):
        sub.current_period_start = datetime.fromtimestamp(stripe_sub["current_period_start"], tz=datetime.UTC)
    if stripe_sub.get("current_period_end"):
        sub.current_period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=datetime.UTC)

    org = await db.get(Organization, org_id)
    if org:
        org.plan = plan.value

    await db.flush()
    logger.info("Subscription upserted for org %s: plan=%s status=%s", org_id, plan, sub_status)


async def _handle_subscription_deleted(stripe_sub: dict, db: AsyncSession) -> None:
    org_id_str = stripe_sub.get("metadata", {}).get("organization_id")
    if not org_id_str:
        return

    import uuid
    try:
        org_id = uuid.UUID(org_id_str)
    except ValueError:
        return

    sub = await db.scalar(select(Subscription).where(Subscription.organization_id == org_id))
    if sub:
        sub.status = SubscriptionStatus.canceled
        sub.canceled_at = datetime.now(datetime.UTC)

    org = await db.get(Organization, org_id)
    if org:
        org.plan = "free"  # Downgrade para free — "starter" é plano pago

    await db.flush()
    logger.info("Subscription canceled for org %s", org_id)
