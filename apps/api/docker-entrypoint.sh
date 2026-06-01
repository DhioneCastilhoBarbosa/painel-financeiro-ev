#!/bin/sh
set -e

echo "[api] Aplicando migrações Alembic..."
alembic upgrade head

echo "[api] Iniciando uvicorn em 0.0.0.0:8000..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2 \
  --proxy-headers \
  --forwarded-allow-ips '*'
