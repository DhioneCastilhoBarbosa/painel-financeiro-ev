from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "financedash",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks_files", "app.workers.tasks_alerts"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Todos os dias às 06h00 (America/Sao_Paulo = UTC-3, logo 09:00 UTC)
        "evaluate-alerts-daily": {
            # Nome completo do módulo — deve corresponder ao caminho Python do task
            "task": "app.workers.tasks_alerts.evaluate_all_organizations",
            "schedule": crontab(hour=9, minute=0),
        },
    },
)
