#!/usr/bin/env bash
# FinanceDash — Backup do banco de dados para S3/R2
# Uso: ./scripts/backup.sh
# Configurar como cron diário: 0 2 * * * /home/ubuntu/financedash-saas/prod/scripts/backup.sh >> /var/log/fd-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROD_DIR/.env"

# Carregar variáveis do .env
set -o allexport
source "$ENV_FILE"
set +o allexport

# ── Configurações ─────────────────────────────────────────────────────────────
S3_BUCKET="${BACKUP_S3_BUCKET:-$R2_BUCKET_NAME}"   # bucket de backup (pode ser diferente do de uploads)
S3_PREFIX="backups/db"
RETAIN_DAYS=30                                      # manter backups dos últimos N dias
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="/tmp/fd_backup_${TIMESTAMP}.sql.gz"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC}  $(date '+%H:%M:%S')  $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $(date '+%H:%M:%S')  $1"; }
err()  { echo -e "${RED}[ERRO]${NC}  $(date '+%H:%M:%S')  $1"; exit 1; }

log "Iniciando backup: $TIMESTAMP"
cd "$PROD_DIR"

# ── 1. Dump do banco ──────────────────────────────────────────────────────────
log "Gerando pg_dump..."
docker compose exec -T db pg_dump \
    -U "${POSTGRES_USER}" \
    --no-password \
    --format=plain \
    --no-acl \
    --no-owner \
    "${POSTGRES_DB}" \
    | gzip -9 > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Dump gerado: $BACKUP_FILE ($BACKUP_SIZE)"

# ── 2. Upload para S3/R2 ──────────────────────────────────────────────────────
S3_KEY="${S3_PREFIX}/fd_backup_${TIMESTAMP}.sql.gz"
log "Enviando para s3://${S3_BUCKET}/${S3_KEY}..."

# Cloudflare R2 via AWS CLI (endpoint compatível com S3)
if [ -n "${R2_ACCOUNT_ID:-}" ]; then
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
        --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
        --region auto
else
    # AWS S3 padrão
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"
fi

log "Upload concluído: s3://${S3_BUCKET}/${S3_KEY}"

# ── 3. Remover arquivo temporário local ──────────────────────────────────────
rm -f "$BACKUP_FILE"

# ── 4. Limpar backups antigos no S3 ──────────────────────────────────────────
log "Removendo backups mais antigos que ${RETAIN_DAYS} dias..."
CUTOFF=$(date -d "${RETAIN_DAYS} days ago" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
         date -v "-${RETAIN_DAYS}d" '+%Y-%m-%dT%H:%M:%SZ')   # macOS fallback

ENDPOINT_ARGS=""
[ -n "${R2_ACCOUNT_ID:-}" ] && ENDPOINT_ARGS="--endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

aws s3api list-objects-v2 \
    --bucket "$S3_BUCKET" \
    --prefix "$S3_PREFIX/" \
    $ENDPOINT_ARGS \
    --query "Contents[?LastModified<='${CUTOFF}'].Key" \
    --output text 2>/dev/null \
    | tr '\t' '\n' \
    | grep -v '^$' \
    | while read -r key; do
        aws s3 rm "s3://${S3_BUCKET}/${key}" $ENDPOINT_ARGS
        warn "Removido: s3://${S3_BUCKET}/${key}"
    done

log "Backup finalizado com sucesso."
