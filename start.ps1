# FinanceDash - iniciar do zero
# Uso: .\start.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '  FinanceDash - iniciar do zero       ' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan

# ── 1. .env ──────────────────────────────────────────────────────────────────
if (-not (Test-Path "$Root\.env")) {
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host ''
    Write-Host '[AVISO] .env criado a partir de .env.example.' -ForegroundColor Yellow
    Write-Host '        Edite o arquivo se precisar ajustar credenciais.' -ForegroundColor Yellow
    Write-Host '        Pressione Enter para continuar ou Ctrl+C para cancelar...' -ForegroundColor Yellow
    Read-Host
} else {
    Write-Host ''
    Write-Host '[OK] .env encontrado.' -ForegroundColor Green
}

# ── 2. Docker: db + redis + api + worker ─────────────────────────────────────
Write-Host ''
Write-Host '[...] Subindo servicos Docker...' -ForegroundColor Cyan
Set-Location $Root
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERRO] docker compose falhou. Verifique se o Docker Desktop esta rodando.' -ForegroundColor Red
    exit 1
}
Write-Host '[OK] Containers iniciados.' -ForegroundColor Green

# ── 3. Aguardar API ──────────────────────────────────────────────────────────
Write-Host ''
Write-Host '[...] Aguardando API em http://localhost:8000/health ...' -ForegroundColor Cyan
$maxAttempts = 40
$attempt = 0
$ready = $false
while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 2
    $attempt++
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:8000/health' -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Write-Host "    tentativa $attempt/$maxAttempts..." -ForegroundColor DarkGray
}

if ($ready) {
    Write-Host '[OK] API pronta!' -ForegroundColor Green
} else {
    Write-Host '[AVISO] API ainda nao respondeu. Verifique: docker compose logs api' -ForegroundColor Yellow
}

# ── 4. Frontend - instalar dependencias se necessario ────────────────────────
$webDir = "$Root\apps\web"
if (-not (Test-Path "$webDir\node_modules")) {
    Write-Host ''
    Write-Host '[...] node_modules nao encontrado. Instalando dependencias...' -ForegroundColor Cyan
    Set-Location $webDir
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[ERRO] npm install falhou.' -ForegroundColor Red
        exit 1
    }
    Write-Host '[OK] Dependencias instaladas.' -ForegroundColor Green
}

# ── 5. Iniciar Next.js em nova janela ─────────────────────────────────────────
Write-Host ''
Write-Host '[...] Iniciando Next.js dev server em nova janela...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$webDir'; Write-Host 'Next.js - FinanceDash' -ForegroundColor Cyan; npm run dev"

# ── Resumo ────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '======================================' -ForegroundColor Green
Write-Host '  Tudo pronto!                        ' -ForegroundColor Green
Write-Host '======================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Frontend : http://localhost:3000' -ForegroundColor White
Write-Host '  API docs : http://localhost:8000/api/docs' -ForegroundColor White
Write-Host ''
Write-Host '  Para parar tudo: .\stop.ps1' -ForegroundColor DarkGray
Write-Host ''
