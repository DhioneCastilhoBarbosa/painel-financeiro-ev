# FinanceDash - retomar desenvolvimento (pos-reinicio)
# Uso: .\dev.ps1
# ─────────────────────────────────────────────────────────────────────────────

$Root = $PSScriptRoot
$webDir = "$Root\apps\web"

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '  FinanceDash - dev                   ' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan

# ── 1. Garantir que o Docker Desktop esta rodando ────────────────────────────
Write-Host ''
Write-Host '[...] Verificando Docker...' -ForegroundColor Cyan
$dockerOk = $false
try {
    docker info 2>$null | Out-Null
    $dockerOk = ($LASTEXITCODE -eq 0)
} catch {}

if (-not $dockerOk) {
    Write-Host '[...] Docker nao esta rodando. Iniciando Docker Desktop...' -ForegroundColor Yellow
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -ErrorAction SilentlyContinue

    $wait = 0
    while ($wait -lt 60) {
        Start-Sleep -Seconds 3
        $wait += 3
        try {
            docker info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
        } catch {}
        Write-Host "    aguardando Docker... ${wait}s" -ForegroundColor DarkGray
    }

    if (-not $dockerOk) {
        Write-Host '[ERRO] Docker nao respondeu. Abra o Docker Desktop manualmente e tente de novo.' -ForegroundColor Red
        exit 1
    }
}
Write-Host '[OK] Docker esta rodando.' -ForegroundColor Green

# ── 2. Ligar containers backend (sem o container web — Next.js roda local) ───
Write-Host ''
Write-Host '[...] Ligando containers (db, redis, api, worker)...' -ForegroundColor Cyan
Set-Location $Root
docker compose up -d db redis api worker
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERRO] Falha ao iniciar containers.' -ForegroundColor Red
    exit 1
}
Write-Host '[OK] Containers prontos.' -ForegroundColor Green

# ── 3. Iniciar Next.js local na porta 3000 ───────────────────────────────────
Write-Host ''
Write-Host '[...] Iniciando Next.js (porta 3000)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$webDir'; npm run dev -- --port 3000"

# ── Resumo ────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '======================================' -ForegroundColor Green
Write-Host '  Pronto!                             ' -ForegroundColor Green
Write-Host '======================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Frontend : http://localhost:3000' -ForegroundColor White
Write-Host '  API      : http://localhost:8000' -ForegroundColor White
Write-Host ''
Write-Host '  Para parar: .\stop.ps1' -ForegroundColor DarkGray
Write-Host ''
