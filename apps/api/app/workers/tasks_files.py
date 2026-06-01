"""
Celery task para processamento assíncrono de arquivos Excel enviados pelos usuários.
Usa SQLAlchemy síncrono (psycopg2) para evitar conflitos de event-loop no worker.
"""

import os
import uuid
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy import create_engine, insert, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.charging_session import ChargingSession
from app.models.data_file import DataFile, FileStatus
from app.services import file_processor
from app.workers.celery_app import celery_app


def _sync_db_url() -> str:
    """Converte URL async (asyncpg) para sync (psycopg2)."""
    url = settings.database_url
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    url = url.replace("postgresql+asyncpg:", "postgresql+psycopg2:")
    return url


from functools import lru_cache as _lru_cache


@_lru_cache(maxsize=1)
def _get_session_factory() -> sessionmaker:
    """
    Engine criado UMA vez por processo (lru_cache).
    Lazy: não falha no import — só conecta na primeira execução de task.
    """
    engine = create_engine(
        _sync_db_url(),
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=3,
        pool_timeout=30,
    )
    return sessionmaker(engine, expire_on_commit=False)


def _read_from_storage(storage_key: str) -> bytes:
    if settings.storage_backend == "local":
        path = Path(settings.local_uploads_dir) / Path(storage_key.replace("\\", "/"))
        return path.read_bytes()
    else:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
        )
        obj = client.get_object(Bucket=settings.r2_bucket_name, Key=storage_key)
        return obj["Body"].read()


@celery_app.task(
    name="app.workers.tasks_files.process_file",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_file(self, file_id: str, storage_key: str, organization_id: str):
    """Task principal de processamento de arquivo."""
    Session = _get_session_factory()

    with Session() as db:
        data_file = db.get(DataFile, file_id)
        if not data_file:
            # Registro ainda não commitado — retry com backoff curto
            raise self.retry(countdown=2, exc=RuntimeError(f"DataFile {file_id} not found, retrying"))

        data_file.status = FileStatus.processing
        db.commit()

        try:
            file_bytes = _read_from_storage(storage_key)

            raw_df = file_processor.read_excel(file_bytes)
            metadata = file_processor.extract_file_metadata(raw_df)
            session_dicts = file_processor.to_session_dicts(raw_df, organization_id, file_id)

            CHUNK_SIZE = 500
            for i in range(0, len(session_dicts), CHUNK_SIZE):
                chunk = session_dicts[i : i + CHUNK_SIZE]
                for record in chunk:
                    record["id"] = str(uuid.uuid4())
                db.execute(insert(ChargingSession), chunk)
            db.flush()

            data_file.status = FileStatus.done
            data_file.row_count = metadata.get("row_count", 0)
            data_file.date_min = metadata.get("date_min")
            data_file.date_max = metadata.get("date_max")
            data_file.stations = metadata.get("stations", [])
            data_file.connector_types = metadata.get("connector_types", [])
            data_file.processed_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as exc:
            db.rollback()
            data_file = db.get(DataFile, file_id)
            if data_file:
                data_file.status = FileStatus.error
                data_file.error_message = str(exc)[:2000]
                db.commit()
            raise self.retry(exc=exc)
