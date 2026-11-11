@echo off
chcp 65001 >nul
rem Central de Eventos - publica agora, sem esperar a rodada de 15 minutos.
rem Mostra o resultado na tela. Precisa ter rodado o instalar.bat antes, com este usuario.
setlocal
set "PS1=%LOCALAPPDATA%\CentralEventos\publicar.ps1"
if not exist "%PS1%" (
  echo A Central de Eventos nao esta instalada para este usuario nesta baia.
  echo Rode o instalar.bat primeiro.
  echo.
  pause
  exit /b 1
)
echo === Central de Eventos - publicando agora ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
echo.
pause
