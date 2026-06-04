import contextlib
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
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

# Pre-defined example datasets — lidos do WebDAV (_examples/) ou do filesystem local
EXAMPLE_DATASETS = {
    "Supermercados — Cidade": "4AC-supermercados-cidade-jan-abr.xlsx",
    "Posto Cidade — Metrópole": "1AC-1DC30-postocidade-metropole-jan-abr.xlsx",
    "Posto Cidade — Turismo (AC+DC60)": "2AC-1DC60-postocidade-turismo-jan-abr.xlsx",
    "Posto Cidade — Turismo (DC30)": "2DC30-postocidade-turismo-jan-abr.xlsx",
    "Posto Cidade — Nordeste": "1AC-1DC60-postocidade-nordeste-jan-abr.xlsx",
}

# Pasta especial no WebDAV que armazena os datasets de exemplo (não é uma org)
_WEBDAV_EXAMPLES_PATH = "_examples"


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


async def _read_example_bytes(filename: str) -> bytes:
    """Lê um dataset de exemplo do WebDAV (produção) ou do filesystem (desenvolvimento)."""
    if settings.storage_backend == "webdav":
        url = f"{settings.webdav_url.rstrip('/')}/{_WEBDAV_EXAMPLES_PATH}/{filename}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                raise FileNotFoundError(f"Exemplo não encontrado no servidor: {filename}")
            if resp.status_code != 200:
                raise RuntimeError(f"Erro ao baixar exemplo do servidor: {resp.status_code}")
            return resp.content
    else:
        path = _DATASETS_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Arquivo de exemplo não encontrado: {path}")
        return path.read_bytes()


async def _example_available(filename: str) -> bool:
    """Verifica se o dataset de exemplo existe e tem conteúdo (tamanho > 0)."""
    if settings.storage_backend == "webdav":
        url = f"{settings.webdav_url.rstrip('/')}/{_WEBDAV_EXAMPLES_PATH}/{filename}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.head(url)
            if resp.status_code != 200:
                return False
            # Checa Content-Length se disponível
            content_length = resp.headers.get("content-length")
            if content_length is not None and int(content_length) == 0:
                return False
            return True
    else:
        path = _DATASETS_DIR / filename
        return path.exists() and path.stat().st_size > 0


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
            data_file.processed_at = datetime.now(UTC)
            await db.commit()

        except Exception as exc:
            await db.rollback()
            data_file = await db.get(DataFile, file_id)
            if data_file:
                data_file.status = FileStatus.error
                data_file.error_message = str(exc)[:2000]
                await db.commit()


# ─── Storage helpers ──────────────────────────────────────────────────────────

# Chave de armazenamento organizada por tipo:
#   {org_id}/datasets/{file_id}.xlsx   ← uploads de dados de sessão
#   {org_id}/examples/{file_id}.xlsx   ← datasets de exemplo carregados
#   {org_id}/payback/{scenario_id}.json  ← análises de payback (reservado)
#   {org_id}/reports/{report_id}.pdf     ← relatórios gerados (reservado)


def _storage_key(org_id: str, file_type: str, file_id: str, ext: str) -> str:
    """Retorna o caminho organizado por tipo de arquivo dentro da pasta da org."""
    return f"{org_id}/{file_type}/{file_id}{ext}"


def _webdav_url(key: str) -> str:
    """Monta a URL completa do arquivo no servidor WebDAV."""
    base = settings.webdav_url.rstrip("/")
    return f"{base}/{key}"


async def _ensure_webdav_dir(org_id: str, file_type: str) -> None:
    """Cria os diretórios necessários no WebDAV (MKCOL, ignora se já existir)."""
    auth = (settings.webdav_username, settings.webdav_password)
    async with httpx.AsyncClient(timeout=30) as client:
        # Cria pasta da org
        await client.request("MKCOL", f"{settings.webdav_url.rstrip('/')}/{org_id}/", auth=auth)
        # Cria subpasta de tipo
        await client.request(
            "MKCOL", f"{settings.webdav_url.rstrip('/')}/{org_id}/{file_type}/", auth=auth
        )
        # Erros 405 (já existe) e 301 são ignorados — apenas exceções de rede propagam


async def _save_to_storage(key: str, content: bytes, file_type: str = "datasets") -> None:
    if settings.storage_backend == "local":
        path = Path(settings.local_uploads_dir) / Path(key.replace("\\", "/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    elif settings.storage_backend == "webdav":
        # Garante que os diretórios existam
        parts = key.split("/")
        if len(parts) >= 2:
            org_id = parts[0]
            ftype = parts[1] if len(parts) > 2 else file_type
            await _ensure_webdav_dir(org_id, ftype)
        url = _webdav_url(key)
        auth = (settings.webdav_username, settings.webdav_password)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.put(
                url,
                content=content,
                auth=auth,
                headers={"Content-Type": "application/octet-stream"},
            )
            if resp.status_code not in (200, 201, 204):
                raise RuntimeError(f"WebDAV PUT falhou: {resp.status_code} {resp.text[:200]}")
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
    elif settings.storage_backend == "webdav":
        url = _webdav_url(storage_key)
        # GET não requer autenticação neste servidor
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                raise FileNotFoundError(f"Arquivo não encontrado no WebDAV: {storage_key}")
            if resp.status_code != 200:
                raise RuntimeError(f"WebDAV GET falhou: {resp.status_code} {resp.text[:200]}")
            return resp.content
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
    elif settings.storage_backend == "webdav":
        url = _webdav_url(key)
        auth = (settings.webdav_username, settings.webdav_password)
        async with httpx.AsyncClient(timeout=30) as client:
            await client.delete(url, auth=auth)
            # Ignora 404 — arquivo pode já ter sido removido
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
    results = []
    for name, fname in EXAMPLE_DATASETS.items():
        available = await _example_available(fname)
        results.append({"name": name, "filename": fname, "available": available})
    return results


@router.post(
    "/examples/{dataset_name}/load",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Carregar dataset de exemplo para demonstração",
)
async def load_example(
    dataset_name: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    filename = EXAMPLE_DATASETS.get(dataset_name)
    if not filename:
        raise HTTPException(status_code=404, detail="Dataset de exemplo não encontrado")

    try:
        content = await _read_example_bytes(filename)
    except FileNotFoundError as err:
        raise HTTPException(
            status_code=404, detail="Arquivo de exemplo não encontrado no servidor"
        ) from err
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail=f"Erro ao acessar arquivo de exemplo: {exc}"
        ) from exc

    if len(content) == 0:
        raise HTTPException(status_code=422, detail="O arquivo de exemplo está vazio no servidor. Contate o suporte.")

    org = await db.get(Organization, current_user.organization_id)
    existing_count = len(
        (
            await db.execute(
                select(DataFile.id).where(DataFile.organization_id == current_user.organization_id)
            )
        ).all()
    )
    limit = PLAN_FILE_LIMITS.get(org.plan, 5)
    if existing_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de {limit} arquivos atingido. Remova arquivos antigos ou faça upgrade.",
        )

    ext = os.path.splitext(filename)[1].lower()
    file_id = str(uuid.uuid4())
    storage_key = _storage_key(str(current_user.organization_id), "examples", file_id, ext)
    await _save_to_storage(storage_key, content, file_type="examples")

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

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "upload_file",
        "data_file",
        file_id,
        f"filename=[Exemplo] {dataset_name}.xlsx size={len(content)}",
    )
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
    existing_count = len(
        (
            await db.execute(
                select(DataFile.id).where(DataFile.organization_id == current_user.organization_id)
            )
        ).all()
    )
    limit = PLAN_FILE_LIMITS.get(org.plan, 5)
    if existing_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de {limit} arquivos atingido no plano {org.plan}. Remova arquivos antigos ou faça upgrade.",
        )

    file_id = str(uuid.uuid4())
    storage_key = _storage_key(str(current_user.organization_id), "datasets", file_id, ext)
    await _save_to_storage(storage_key, content, file_type="datasets")

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

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "upload_file",
        "data_file",
        file_id,
        f"filename={file.filename} size={len(content)}",
    )
    background_tasks.add_task(
        _process_file_background, file_id, storage_key, str(current_user.organization_id)
    )
    return data_file


@router.get(
    "",
    response_model=list[FileResponse],
    summary="Listar arquivos da organização com status de processamento",
)
async def list_files(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DataFile)
        .where(DataFile.organization_id == current_user.organization_id)
        .order_by(DataFile.created_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/{file_id}",
    response_model=FileResponse,
    summary="Detalhes de um arquivo específico (status, linhas, datas, estações)",
)
async def get_file(file_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await _get_file_or_404(file_id, current_user.organization_id, db)


@router.delete(
    "/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir arquivo e seus dados de sessão do banco",
)
async def delete_file(file_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    f = await _get_file_or_404(file_id, current_user.organization_id, db)
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "delete_file",
        "data_file",
        file_id,
        f"filename={f.original_filename}",
    )
    with contextlib.suppress(Exception):
        await _delete_from_storage(f.storage_key)
    await db.delete(f)


@router.post(
    "/{file_id}/reprocess",
    response_model=FileResponse,
    summary="Reprocessar um arquivo em status de erro",
)
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
