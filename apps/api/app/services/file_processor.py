"""
Processa arquivos Excel da plataforma Intelbras e retorna linhas normalizadas
prontas para inserção na tabela charging_sessions.

Migrado de eletropostos_dashboard.py — process_df() e lógica de parse.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pandas as pd

# ─── Parsers ─────────────────────────────────────────────────────────────────


def _parse_start_date(value: str) -> datetime | None:
    """Extrai a data de início do campo 'Inicio - Fim' (ex: '15/01/2025 08:30 - 09:15')."""
    if not isinstance(value, str):
        return None
    part = value.split(" - ")[0].strip()
    for fmt in ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(part, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _parse_end_date(value: str) -> datetime | None:
    """Extrai a data de fim do campo 'Inicio - Fim'."""
    if not isinstance(value, str):
        return None
    parts = value.split(" - ")
    if len(parts) < 2:
        return None
    end_str = parts[-1].strip()
    # Fim pode vir sem data (apenas hora), usa a data do início
    start_date = parts[0].strip().split()[0]
    for fmt in ("%d/%m/%Y %H:%M", "%H:%M"):
        try:
            if fmt == "%H:%M":
                full = f"{start_date} {end_str}"
                return datetime.strptime(full, "%d/%m/%Y %H:%M").replace(tzinfo=UTC)
            return datetime.strptime(end_str, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _parse_duration(value) -> float:
    """Converte duração HH:MM:SS para minutos."""
    if pd.isna(value):
        return 0.0
    s = str(value).strip()
    m = re.match(r"(\d+):(\d+):(\d+)", s)
    if m:
        h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return h * 60 + mi + se / 60
    m = re.match(r"(\d+):(\d+)", s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    return 0.0


def _col(df: pd.DataFrame, *names: str) -> str | None:
    """Retorna o primeiro nome de coluna que existir no DataFrame."""
    for name in names:
        if name in df.columns:
            return name
    return None


# ─── Normalização principal ───────────────────────────────────────────────────


def read_excel(file_bytes: bytes) -> pd.DataFrame:
    import io
    import zipfile

    if len(file_bytes) == 0:
        raise ValueError(
            "O arquivo está vazio (0 bytes). Verifique se o dataset de exemplo está corretamente instalado no servidor."
        )

    # xlsx is a zip archive — detect format and choose engine
    if zipfile.is_zipfile(io.BytesIO(file_bytes)):
        return pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")

    # Try xlrd for legacy .xls binary format
    try:
        return pd.read_excel(io.BytesIO(file_bytes), engine="xlrd")
    except Exception as err:
        raise ValueError(
            "Formato de arquivo não suportado. Envie um arquivo .xlsx (Excel 2007+) ou .xls válido."
        ) from err


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """
    Recebe o DataFrame bruto do Excel e retorna um DataFrame normalizado
    com colunas padronizadas para inserção no banco.
    """
    df = df.copy()

    # Coluna de intervalo
    intervalo_col = _col(df, "Inicio - Fim", "Início - Fim")
    if intervalo_col is None:
        raise ValueError("Coluna 'Inicio - Fim' não encontrada no arquivo")

    df["started_at"] = df[intervalo_col].apply(_parse_start_date)
    df["ended_at"] = df[intervalo_col].apply(_parse_end_date)

    # Duração
    dur_col = _col(df, "Duração", "Duracao", "Duração (min)")
    df["duration_minutes"] = df[dur_col].apply(_parse_duration) if dur_col else 0.0

    # Estação
    station_col = _col(df, "Estação", "Estacao", "Estacao (Nome)", "Station")
    df["station_name"] = df[station_col] if station_col else None

    # Tipo de conector
    connector_col = _col(df, "Conector(Tipo)", "Connector Type", "Tipo Conector")
    df["connector_type"] = df[connector_col] if connector_col else None

    # Usuário
    user_name_col = _col(df, "Usuário(Nome)", "Usuário (Nome)", "Usuario(Nome)", "User Name")
    df["user_name"] = df[user_name_col] if user_name_col else None
    user_col = _col(df, "Usuário(Tag)", "Usuário (ID)", "Usuario(Tag)", "User Tag")
    df["user_tag"] = df[user_col] if user_col else None

    # Revenue
    for col in [
        "Receita(R$)",
        "Energia(kWh)",
        "Valor Ociosidade",
        "Receita(R$) por Início de Recarga",
        "Receita(R$) por kWh",
    ]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        else:
            df[col] = 0.0

    df["revenue_start_fee"] = df["Receita(R$) por Início de Recarga"]
    df["revenue_energy"] = df["Energia(kWh)"] * df["Receita(R$) por kWh"]
    df["revenue_idle"] = df["Valor Ociosidade"]
    df["revenue_total"] = df["revenue_start_fee"] + df["revenue_energy"] + df["revenue_idle"]
    df["energy_kwh"] = df["Energia(kWh)"]

    # Pagamento
    paid_col = _col(df, "Pago?", "Pago")
    status_col = _col(df, "Pagamento(Status)", "Payment Status")
    method_col = _col(df, "Pagamento(Tipo)", "Payment Type")

    df["is_paid"] = (df[paid_col].str.lower() == "sim") if paid_col else False
    df["payment_status"] = df.apply(
        lambda r: (
            "paid"
            if r["is_paid"]
            else ("pending" if (status_col and r.get(status_col) == "pending") else "rejected")
        ),
        axis=1,
    )

    # Normaliza método de pagamento
    if method_col:
        method_map = {
            "PAGBANK_CARD": "pagbank",
            "WALLET": "wallet",
            "VOUCHER": "voucher",
            "MANUAL": "manual",
        }
        df["payment_method"] = df[method_col].map(
            lambda x: method_map.get(str(x).upper(), str(x).lower()) if pd.notna(x) else None
        )
    else:
        df["payment_method"] = None

    df["has_voucher"] = df["payment_method"] == "voucher"

    # Remove linhas sem data de início válida
    df = df[df["started_at"].notna()].copy()

    return df


def to_session_dicts(
    df: pd.DataFrame,
    organization_id: str,
    file_id: str,
) -> list[dict]:
    """Converte o DataFrame normalizado em lista de dicts para bulk insert."""
    normalized = normalize(df)
    records = []

    for _, row in normalized.iterrows():
        ended = row.get("ended_at")
        records.append(
            {
                "organization_id": organization_id,
                "file_id": file_id,
                "started_at": row["started_at"],
                "ended_at": ended if (ended is not None and not pd.isna(ended)) else None,
                "duration_minutes": float(row["duration_minutes"])
                if pd.notna(row["duration_minutes"])
                else None,
                "station_name": str(row["station_name"]) if pd.notna(row["station_name"]) else None,
                "connector_type": str(row["connector_type"])
                if pd.notna(row["connector_type"])
                else None,
                "user_name": str(row["user_name"]) if pd.notna(row.get("user_name")) else None,
                "user_tag": str(row["user_tag"]) if pd.notna(row["user_tag"]) else None,
                "revenue_total": float(row["revenue_total"]),
                "revenue_start_fee": float(row["revenue_start_fee"]),
                "revenue_energy": float(row["revenue_energy"]),
                "revenue_idle": float(row["revenue_idle"]),
                "energy_kwh": float(row["energy_kwh"]),
                "payment_status": row["payment_status"],
                "payment_method": row.get("payment_method")
                if pd.notna(row.get("payment_method"))
                else None,
                "is_paid": bool(row["is_paid"]),
                "has_voucher": bool(row["has_voucher"]),
                "raw": {},
            }
        )

    return records


def extract_file_metadata(df: pd.DataFrame) -> dict:
    """Extrai metadados do arquivo para salvar em data_files."""
    try:
        normalized = normalize(df)
        station_col = "station_name"
        connector_col = "connector_type"
        return {
            "row_count": len(normalized),
            "date_min": normalized["started_at"].min(),
            "date_max": normalized["started_at"].max(),
            "stations": sorted(normalized[station_col].dropna().unique().tolist()),
            "connector_types": sorted(normalized[connector_col].dropna().unique().tolist()),
        }
    except Exception as e:
        return {"row_count": 0, "error": str(e)}
