@echo off
chcp 65001 >nul
rem Central de Eventos - instala a publicacao automatica nesta baia (sem administrador).
rem Antes: copie config.example.json para config.json, nesta mesma pasta, e cole o token.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-baia.ps1"
echo.
pause
