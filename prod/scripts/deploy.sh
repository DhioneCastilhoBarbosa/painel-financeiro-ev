#!/usr/bin/env bash
# FinanceDash — Script de deploy / atualização
# Uso: ./scripts/deploy.sh          (atualiza tudo)
#      ./scripts/deploy.sh --no-web  (só API/worker, pula rebuild do frontend)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROD_DIR="$REPO_DIR/prod"
BRANCH="${DEPLOY_BRANCH:-main}"
REBUILD_WEB=true

for arg in "$@"; do
    [[ "$arg" == "--no-web" ]] && REBUILD_WEB=false
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()   { echo -e "${GREEN}[OK]${NC} $1"; }
info()  { echo -e "${CYAN}[..]${NC} $1"; }
warn()  { echo -e "${YELLOW}[AVISO]${NC} $1"; }
err()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

echo ""
echo "======================================================"
echo "  FinanceDash — Deploy  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================"
echo ""

cd "$REPO_DIR"

# ── 1. Atualizar código ───────────────────────────────────────────────────────
info "Atualizando código (branch: $BRANCH)..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
log "Código atualizado: $(git log -1 --oneline)"

cd "$PROD_DIR"

# ── 2. Build das imagens ──────────────────────────────────────────────────────
info "Construindo imagem da API..."
docker compose build api

if $REBUILD_WEB; then
    info "Construindo imagem do frontend..."
    docker compose build web
else
    warn "Pulando build do frontend (--no-web)."
fi

# ── 3. Subir containers com zero-downtime ─────────────────────────────────────
info "Atualizando containers..."
docker compose up -d --remove-orphans

# ── 4. Aguardar a API ficar saudável ─────────────────────────────────────────
info "Aguardando API..."
for i in $(seq 1 24); do
    if docker compose exec -T api python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
        &>/dev/null; then
        log "API pronta."
        break
    fi
    if [ $i -eq 24 ]; then
        err "API não respondeu após 2 minutos. Verifique: docker compose logs api"
    fi
    echo "  Aguardando... ($i/24)"
    sleep 5
done

# ── 5. Migrações do banco de dados ────────────────────────────────────────────
info "Verificando migrações pendentes..."
PENDING=$(docker compose exec -T api alembic history -r "current:head" 2>/dev/null | grep -v "^$" | wc -l || echo "0")
if [ "$PENDING" -gt 1 ]; then
    info "Aplicando migrações..."
    docker compose exec -T api alembic upgrade head
    log "Migrações aplicadas."
else
    log "Banco de dados já atualizado."
fi

# ── 6. Limpar imagens antigas ─────────────────────────────────────────────────
info "Limpando imagens antigas..."
docker image prune -f --filter "until=24h" > /dev/null 2>&1 || true
log "Limpeza concluída."

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo -e "${GREEN}  Deploy concluído!${NC}  $(date '+%H:%M:%S')"
echo "======================================================"
echo ""
echo "  Containers ativos:"
docker compose ps --format "  {.Name}  {.Status}"
echo ""
