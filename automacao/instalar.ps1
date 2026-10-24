<#
.SYNOPSIS
  Instala (ou remove) a sincronização automática da Central de Eventos nesta máquina.

.DESCRIPTION
  1. cria um ambiente Python isolado em automacao\.venv e instala o python-pptx;
  2. cria o config.ini a partir do config.exemplo.ini (se ainda não existir);
  3. registra a tarefa "Central de Eventos - Sincronizar" no Agendador de Tarefas,
     rodando a cada -Intervalo minutos enquanto o seu usuário estiver logado
     (o OneDrive e o token salvo no Windows só funcionam com a sessão aberta).

  Rode sem privilégio de administrador, logado com o usuário que tem o OneDrive.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Intervalo 15
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Remover
#>
param(
  [ValidateRange(5, 1440)][int]$Intervalo = 10,
  [string]$Python = "",
  [switch]$Remover
)

$ErrorActionPreference = "Stop"
$NomeTarefa = "Central de Eventos - Sincronizar"
$Aqui = $PSScriptRoot

if ($Remover) {
  Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa '$NomeTarefa' removida. (A pasta .venv e o config.ini foram mantidos.)" -ForegroundColor Green
  exit 0
}

# 1. Python ------------------------------------------------------------------
if (-not $Python) {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    $Python = (& py -3 -c "import sys; print(sys.executable)").Trim()
  } elseif ((Get-Command python -ErrorAction SilentlyContinue) -and ((Get-Command python).Source -notlike "*WindowsApps*")) {
    $Python = (Get-Command python).Source
  } else {
    throw "Python não encontrado. Instale o Python 3.10+ de python.org (marque 'Add python.exe to PATH') ou informe -Python C:\caminho\python.exe"
  }
}
Write-Host "Python: $Python"

$venv = Join-Path $Aqui ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
  Write-Host "Criando ambiente em $venv ..."
  & $Python -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw "falha ao criar o ambiente virtual" }
}
$venvPy = Join-Path $venv "Scripts\python.exe"
$venvPyw = Join-Path $venv "Scripts\pythonw.exe"

Write-Host "Instalando dependências (python-pptx) ..."
& $venvPy -m pip install --quiet --disable-pip-version-check -r (Join-Path $Aqui "requirements.txt")
if ($LASTEXITCODE -ne 0) {
  throw "pip falhou. Atrás de proxy? Defina `$env:HTTPS_PROXY='http://ENDERECO:PORTA' e rode de novo (ver README)."
}

# 2. config.ini ----------------------------------------------------------------
$config = Join-Path $Aqui "config.ini"
if (-not (Test-Path $config)) {
  Copy-Item (Join-Path $Aqui "config.exemplo.ini") $config
  Write-Host ""
  Write-Host "Criei o config.ini. Ajuste o caminho da pasta do SharePoint e salve; depois rode este instalador de novo." -ForegroundColor Yellow
  Start-Process notepad.exe $config
  exit 0
}

# Teste rápido antes de agendar: simula uma rodada (não publica nada).
Write-Host "Testando a leitura da pasta (simulação, nada é publicado) ..."
& $venvPy (Join-Path $Aqui "sincronizar.py") --simular
if ($LASTEXITCODE -ne 0) {
  throw "a simulação falhou — veja a mensagem acima e logs\sincronizar.log antes de agendar."
}

# 3. Tarefa agendada ----------------------------------------------------------
$acao = New-ScheduledTaskAction -Execute $venvPyw -Argument ('"' + (Join-Path $Aqui "sincronizar.py") + '"') -WorkingDirectory $Aqui
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Intervalo)
$config_tarefa = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$usuario = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Settings $config_tarefa `
  -Principal $principal -Description "Lê os .pptx da pasta do SharePoint e publica a Central de Eventos no GitHub Pages. Ver $Aqui\README.md" `
  -Force | Out-Null

Write-Host ""
Write-Host "Pronto! A tarefa '$NomeTarefa' roda a cada $Intervalo minutos (usuário $usuario)." -ForegroundColor Green
Write-Host "Log: $Aqui\logs\sincronizar.log"
Write-Host "Para rodar agora:  Start-ScheduledTask -TaskName '$NomeTarefa'"
