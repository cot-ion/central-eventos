@echo off
chcp 65001 >nul
rem Central de Eventos - remove a publicacao automatica desta baia.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar-baia.ps1"
echo.
pause
