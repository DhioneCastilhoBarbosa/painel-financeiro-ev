# ---------------------------------------------------------------------------
# Publica os CSVs da ABVE no repositório, substituindo os do mês anterior,
# e envia para o servidor (git push → deploy Dokploy).
#
# Uso: dê dois cliques em "subir-abve.bat" (ou rode este .ps1 no PowerShell).
# Pré-requisito: ter baixado os CSVs com os scripts de captura (ver README.md):
#   - eletropostos_por_municipio.csv
#   - frota_ev_por_municipio.csv
# (basta ter pelo menos um deles na pasta Downloads.)
# ---------------------------------------------------------------------------
param(
  [string]$Downloads = "$env:USERPROFILE\Downloads",
  # scripts\abve  ->  (parent)=scripts  ->  (parent)=raiz do repo
  [string]$RepoRoot  = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

$ErrorActionPreference = 'Stop'
$destDir = Join-Path $RepoRoot 'apps\web\public\data\abve'
$arquivos = @('eletropostos_por_municipio.csv', 'frota_ev_por_municipio.csv')

if (-not (Test-Path $destDir)) { throw "Pasta destino não encontrada: $destDir (RepoRoot correto?)" }

Write-Host "Repo:      $RepoRoot"
Write-Host "Downloads: $Downloads`n"

$copiados = @()
foreach ($f in $arquivos) {
  $src = Join-Path $Downloads $f
  if (-not (Test-Path $src)) {
    Write-Host ("• {0}: nao encontrado em Downloads — pulando." -f $f) -ForegroundColor Yellow
    continue
  }
  # Validação básica: lê como UTF-8 e exige cabeçalho + volume mínimo de linhas.
  $linhas = [System.IO.File]::ReadAllLines($src, [System.Text.Encoding]::UTF8)
  if ($linhas.Count -lt 50) {
    Write-Host ("• {0}: so {1} linhas — suspeito (filtro nao removido?). Pulando." -f $f, $linhas.Count) -ForegroundColor Red
    continue
  }
  if ($linhas[0] -notmatch ',') {
    Write-Host ("• {0}: cabecalho sem virgulas — formato inesperado. Pulando." -f $f) -ForegroundColor Red
    continue
  }
  Copy-Item -LiteralPath $src -Destination (Join-Path $destDir $f) -Force
  Write-Host ("✓ {0}: publicado no repo ({1} linhas)" -f $f, ($linhas.Count - 1)) -ForegroundColor Green
  $copiados += $f
}

if ($copiados.Count -eq 0) {
  Write-Host "`nNada para publicar. Baixe os CSVs antes (ver README.md)." -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  git add apps/web/public/data/abve/*.csv
  $mes = (Get-Date).ToString('yyyy-MM')
  $msg = "data(abve): atualiza dados $mes ($($copiados -join ', '))"
  git commit -m $msg
  git push
  Write-Host "`n✅ Publicado e enviado ao servidor: $($copiados -join ', ')" -ForegroundColor Green
  Write-Host "O Dokploy fará o redeploy automaticamente." -ForegroundColor Green
}
finally {
  Pop-Location
}
