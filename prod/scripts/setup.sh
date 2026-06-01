#!/usr/bin/env bash
# FinanceDash — Setup inicial do servidor EC2 (Ubuntu 22.04)
# Executar UMA VEZ na instância recém-criada:
#   curl -sSL https://raw.githubusercontent.com/SEU_ORG/financedash-saas/main/prod/scripts/setup.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configurações ─────────────────────────────────────────────────────────────
REPO_URL="https://github.com/SEU_ORG/financedash-saas.git"   # ← AJUSTE
REPO_DIR="/home/ubuntu/financedash-saas"
DOMAIN=""        # ex: app.financedash.com.br  ← AJUSTE
EMAIL=""         # e-mail para notificações Let's Encrypt  ← AJUSTE

# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

[[ -z "$DOMAIN" ]] && err "Defina DOMAIN no topo do script antes de executar."
[[ -z "$EMAIL" ]]  && err "Defina EMAIL no topo do script antes de executar."

echo ""
echo "======================================================"
echo "  FinanceDash — Setup EC2"
echo "  Domínio : $DOMAIN"
echo "  Repo    : $REPO_URL"
echo "======================================================"
echo ""

# ── 1. Atualizar o sistema ────────────────────────────────────────────────────
log "Atualizando pacotes..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Instalar dependências ──────────────────────────────────────────────────
log "Instalando dependências..."
sudo apt-get install -y -qq \
    git curl wget unzip awscli \
    ca-certificates gnupg lsb-release

# ── 3. Instalar Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Instalando Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker ubuntu
    sudo systemctl enable --now docker
    log "Docker instalado."
else
    log "Docker já instalado — pulando."
fi

# ── 4. Instalar Certbot ───────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
    log "Instalando Certbot..."
    sudo apt-get install -y -qq certbot
    log "Certbot instalado."
else
    log "Certbot já instalado — pulando."
fi

# ── 5. Firewall ───────────────────────────────────────────────────────────────
log "Configurando firewall (ufw)..."
sudo apt-get install -y -qq ufw
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   comment 'SSH'
sudo ufw allow 80/tcp   comment 'HTTP'
sudo ufw allow 443/tcp  comment 'HTTPS'
sudo ufw --force enable
log "Firewall configurado."

# ── 6. Clonar repositório ─────────────────────────────────────────────────────
if [ -d "$REPO_DIR" ]; then
    warn "Repositório já existe em $REPO_DIR — pulando clone."
else
    log "Clonando repositório..."
    git clone "$REPO_URL" "$REPO_DIR"
    log "Repositório clonado em $REPO_DIR"
fi

# ── 7. Criar .env de produção ─────────────────────────────────────────────────
ENV_FILE="$REPO_DIR/prod/.env"
if [ -f "$ENV_FILE" ]; then
    warn ".env já existe — não sobrescrever. Verifique manualmente."
else
    cp "$REPO_DIR/prod/.env.example" "$ENV_FILE"
    # Substituir domínio automaticamente
    sed -i "s|SEU_DOMINIO|$DOMAIN|g" "$ENV_FILE"
    # Gerar SECRET_KEY aleatória
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s|SUBSTITUIR_CHAVE_ALEATORIA_64_CHARS_HEX|$SECRET|" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log ".env criado em $ENV_FILE"
    warn "IMPORTANTE: edite $ENV_FILE e preencha TODOS os campos SUBSTITUIR antes de continuar."
    warn "Use: nano $ENV_FILE"
    echo ""
    read -p "Pressione ENTER após preencher o .env para continuar..."
fi

# ── 8. Substituir domínio no nginx.conf ───────────────────────────────────────
NGINX_CONF="$REPO_DIR/prod/nginx/nginx.conf"
if grep -q "SEU_DOMINIO" "$NGINX_CONF"; then
    sed -i "s|SEU_DOMINIO|$DOMAIN|g" "$NGINX_CONF"
    log "Domínio configurado no nginx.conf: $DOMAIN"
fi

# ── 9. Obter certificado SSL (Let's Encrypt) ──────────────────────────────────
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    log "Obtendo certificado SSL para $DOMAIN..."
    # Certbot standalone (nginx ainda não está rodando)
    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN"
    log "Certificado SSL obtido."
else
    log "Certificado SSL já existe — pulando."
fi

# ── 10. Configurar renovação automática ───────────────────────────────────────
RENEW_HOOK="$REPO_DIR/prod/scripts/_certbot-renew-hook.sh"
cat > "$RENEW_HOOK" <<'HOOK'
#!/bin/bash
cd /home/ubuntu/financedash-saas/prod
docker compose exec nginx nginx -s reload
HOOK
chmod +x "$RENEW_HOOK"

CRON_JOB="0 3 * * * certbot renew --quiet --deploy-hook $RENEW_HOOK"
( crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_JOB" ) | crontab -
log "Renovação automática de SSL configurada (cron 03:00 diário)."

# ── 11. Fazer o primeiro build e subir ────────────────────────────────────────
log "Construindo imagens Docker (pode demorar alguns minutos)..."
cd "$REPO_DIR/prod"
docker compose build api web

log "Subindo containers..."
docker compose up -d

log "Aguardando API ficar saudável..."
for i in $(seq 1 20); do
    if docker compose exec -T api python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
        &>/dev/null; then
        log "API pronta."
        break
    fi
    echo "  Aguardando... ($i/20)"
    sleep 5
done

# ── 12. Executar migrações ────────────────────────────────────────────────────
log "Executando migrações do banco de dados..."
docker compose exec -T api alembic upgrade head
log "Migrações aplicadas."

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo -e "${GREEN}  Setup concluído!${NC}"
echo "======================================================"
echo ""
echo "  Site    : https://$DOMAIN"
echo "  API     : https://$DOMAIN/api/docs"
echo "  Logs    : cd $REPO_DIR/prod && docker compose logs -f"
echo "  Deploy  : cd $REPO_DIR/prod && ./scripts/deploy.sh"
echo ""
