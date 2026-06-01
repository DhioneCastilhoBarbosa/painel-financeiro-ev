# FinanceDash — parar todos os servicos Docker
# Uso: .\stop.ps1
# ─────────────────────────────────────────────────────────────────────────────

$Root = $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "[...] Parando servicos Docker..." -ForegroundColor Cyan
docker compose down
Write-Host "[OK] Containers parados." -ForegroundColor Green
Write-Host ""
Write-Host "Nota: feche manualmente a janela do Next.js se estiver aberta." -ForegroundColor DarkGray
Write-Host ""
