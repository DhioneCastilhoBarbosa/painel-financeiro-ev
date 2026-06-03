import contextlib
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import CurrentUser
from app.models.charging_session import ChargingSession
from app.models.data_file import DataFile, FileStatus
from app.models.organization import Organization
from app.schemas.file import FileResponse
from app.services import file_processor
from app.services.audit_service import log_action

# Pre-defined example datasets — check multiple candidate paths in priority order
def _find_datasets_dir() -> Path:
    env_dir = os.environ.get("DATASETS_DIR")
    if env_dir:
        return Path(env_dir)
    local = Path(__file__).parent.parent.parent.parent.parent / "datasets"
    if local.exists():
        return local
    fallback = Path("/datasets")
    if fallback.exists():
        return fallback
    return local

_DATASETS_DIR = _find_datasets_dir()
EXAMPLE_DATASETS = {
    "Supermercados — Cidade": "4AC-supermercados-cidade-jan-abr.xlsx",
    "Posto Cidade — Metrópole": "1AC-1DC30-postocidade-metropole-jan-abr.xlsx",
    "Posto Cidade — Turismo (AC+DC60)": "2AC-1DC60-postocidade-turismo-jan-abr.xlsx",
    "Posto Cidade — Turismo (DC30)": "2DC30-postocidade-turismo-jan-abr.xlsx",
    "Posto Cidade — Nordeste": "1AC-1DC60-postocidade-nordeste-jan-abr.xlsx",
}

router = APIRouter()

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

PLAN_FILE_LIMITS = {
    "trial": 5,
    "starter": 5,
    "pro": 30,
    "enterprise": 9999,
}


# ─── Background processing ────────────────────────────────────────────────────

async def _process_file_background(file_id: str, storage_key: str, organization_id: str) -> None:
    """Processa arquivo Excel em background após a resposta ser enviada ao cliente."""
    async with AsyncSessionLocal() as db:
        data_file = await db.get(DataFile, file_id)
        if not data_file:
            return

        data_file.status = FileStatus.processing
        await db.commit()

        try:
            file_bytes = await _read_from_storage(storage_key)
            raw_df = file_processor.read_excel(file_bytes)
            metadata = file_processor.extract_file_metadata(raw_df)
            session_dicts = file_processor.to_session_dicts(raw_df, organization_id, file_id)

            CHUNK_SIZE = 500
            for i in range(0, len(session_dicts), CHUNK_SIZE):
                chunk = session_dicts[i : i + CHUNK_SIZE]
                for record in chunk:
                    record["id"] = str(uuid.uuid4())
                await db.execute(insert(ChargingSession), chunk)
            await db.flush()

            data_file.status = FileStatus.done
            data_file.row_count = metadata.get("row_count", 0)
            data_file.date_min = metadata.get("date_min")
            data_file.date_max = metadata.get("date_max")
            data_file.stations = metadata.get("stations", [])
            data_file.connector_types = metadata.get("connector_types", [])
            data_file.processed_at = datetime.now(datetime.UTC)
            await db.commit()

        except Exception as exc:
            await db.rollback()
            data_file = await db.get(DataFile, file_id)
            if data_file:
                data_file.status = FileStatus.error
                data_file.error_message = str(exc)[:2000]
                await db.commit()


# ─── Storage helpers ──────────────────────────────────────────────────────────

async def _save_to_storage(key: str, content: bytes) -> None:
    if settings.storage_backend == "local":
        path = Path(settings.local_uploads_dir) / Path(key.replace("\\", "/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    else:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
        )
        client.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=content)


async def _read_from_storage(storage_key: str) -> bytes:
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


async def _delete_from_storage(key: str) -> None:
    if settings.storage_backend == "local":
        path = Path(settings.local_uploads_dir) / Path(key.replace("\\", "/"))
        if path.exists():
            path.unlink()
    else:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
        )
        client.delete_object(Bucket=settings.r2_bucket_name, Key=key)


async def _get_file_or_404(file_id: str, organization_id, db: AsyncSession) -> DataFile:
    f = await db.get(DataFile, file_id)
    if not f or str(f.organization_id) != str(organization_id):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return f


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/examples", summary="Listar datasets de exemplo disponíveis (demos pré-carregados)")
async def list_examples():
    return [
        {"name": name, "filename": fname, "available": (_DATASETS_DIR / fname).exists()}
        for name, fname in EXAMPLE_DATASETS.items()
    ]


@router.post("/examples/{dataset_name}/load", response_model=FileResponse, status_code=status.HTTP_201_CREATED, summary="Carregar dataset de exemplo para demonstração")
async def load_example(
    dataset_name: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    filename = EXAMPLE_DATASETS.get(dataset_name)
    if not filename:
        raise HTTPException(status_code=404, detail="Dataset de exemplo não encontrado")

    path = _DATASETS_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo de exemplo não encontrado no servidor")

    content = path.read_bytes()

    org = await db.get(Organization, current_user.organization_id)
    existing_count = len((await db.execute(
        select(DataFile.id).where(DataFile.organization_id == current_user.organization_id)
    )).all())
    limit = PLAN_FILE_LIMITS.get(org.plan, 5)
    if existing_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de {limit} arquivos atingido. Remova arquivos antigos ou faça upgrade.",
        )

    ext = os.path.splitext(filename)[1].lower()
    file_id = str(uuid.uuid4())
    storage_key = f"{current_user.organization_id}/{file_id}{ext}"
    await _save_to_storage(storage_key, content)

    data_file = DataFile(
        id=file_id,
        organization_id=current_user.organization_id,
        uploaded_by=current_user.id,
        filename=f"{file_id}{ext}",
        original_filename=f"[Exemplo] {dataset_name}.xlsx",
        storage_key=storage_key,
        file_size_bytes=len(content),
        status=FileStatus.pending,
        stations=[],
        connector_types=[],
    )
    db.add(data_file)
    await db.commit()

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "upload_file", "data_file", file_id,
                     f"filename=[Exemplo] {dataset_name}.xlsx size={len(content)}")
    background_tasks.add_task(
        _process_file_background, file_id, storage_key, str(current_user.organization_id)
    )
    return data_file


@router.post(
    "",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Fazer upload de arquivo de sessões (.xlsx / .xls, máx 50 MB)",
    description=(
        "Recebe um arquivo Excel com registros de sessões de recarga. "
        "O processamento é **assíncrono** via Celery — o status evolui de `pending` → `processing` → `done` (ou `error`). "
        "Limite por plano: 5 arquivos (Trial/Starter) ou 30 arquivos (Pro)."
    ),
    responses={
        201: {"description": "Arquivo aceito. Processamento em background."},
        400: {"description": "Formato inválido ou tamanho excedido"},
        402: {"description": "Limite de arquivos do plano atingido"},
    },
)
async def upload_file(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Apenas arquivos .xlsx são suportados")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 50 MB")

    org = await db.get(Organization, current_user.organization_id)
    existing_count = len((await db.execute(
        select(DataFile.id).where(DataFile.organization_id == current_user.organization_id)
    )).all())
    limit = PLAN_FILE_LIMITS.get(org.plan, 5)
    if existing_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de {limit} arquivos atingido no plano {org.plan}. Remova arquivos antigos ou faça upgrade.",
        )

    file_id = str(uuid.uuid4())
    storage_key = f"{current_user.organization_id}/{file_id}{ext}"
    await _save_to_storage(storage_key, content)

    data_file = DataFile(
        id=file_id,
        organization_id=current_user.organization_id,
        uploaded_by=current_user.id,
        filename=f"{file_id}{ext}",
        original_filename=file.filename or f"arquivo{ext}",
        storage_key=storage_key,
        file_size_bytes=len(content),
        status=FileStatus.pending,
        stations=[],
        connector_types=[],
    )
    db.add(data_file)
    await db.commit()

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "upload_file", "data_file", file_id,
                     f"filename={file.filename} size={len(content)}")
    background_tasks.add_task(
        _process_file_background, file_id, storage_key, str(current_user.organization_id)
    )
    return data_file


@router.get("", response_model=list[FileResponse], summary="Listar arquivos da organização com status de processamento")
async def list_files(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DataFile)
        .where(DataFile.organization_id == current_user.organization_id)
        .order_by(DataFile.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{file_id}", response_model=FileResponse, summary="Detalhes de um arquivo específico (status, linhas, datas, estações)")
async def get_file(file_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await _get_file_or_404(file_id, current_user.organization_id, db)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Excluir arquivo e seus dados de sessão do banco")
async def delete_file(file_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await _get_file_or_404(file_id, current_user.organization_id, db)
    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "delete_file", "data_file", file_id,
                     f"filename={f.original_filename}")
    with contextlib.suppress(Exception):
        await _delete_from_storage(f.storage_key)
    await db.delete(f)


@router.post("/{file_id}/reprocess", response_model=FileResponse, summary="Reprocessar um arquivo em status de erro")
async def reprocess_file(
    file_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    f = await _get_file_or_404(file_id, current_user.organization_id, db)
    if f.status == FileStatus.processing:
        raise HTTPException(status_code=409, detail="Arquivo já está sendo processado")
    f.status = FileStatus.pending
    f.error_message = None
    await db.commit()
    background_tasks.add_task(
        _process_file_background, file_id, f.storage_key, str(current_user.organization_id)
    )
    return f
