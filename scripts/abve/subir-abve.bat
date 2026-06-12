@echo off
chcp 65001 >nul
echo === Publicador de dados ABVE (eletropostos + frota) ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0subir-abve.ps1"
echo.
pause
