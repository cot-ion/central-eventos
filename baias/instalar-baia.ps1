<#
  Instala a publicação automática da Central de Eventos nesta baia.
  Chamado pelo instalar.bat. Não precisa de administrador.

  1. copia publicar.ps1 e executar-oculto.vbs para %LOCALAPPDATA%\CentralEventos
  2. guarda o config.json com o token criptografado (DPAPI: só este usuário lê)
  3. cria a tarefa agendada (a cada N minutos) e a execução ao fazer login
  4. roda um diagnóstico com [OK]/[FALHA] e um teste sem publicar (DryRun)

  Rodar de novo é seguro: serve para trocar o token ou mudar a configuração.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:Falhas = 0

$Origem = $PSScriptRoot
$Destino = Join-Path $env:LOCALAPPDATA 'CentralEventos'
$NomeTarefa = 'CentralEventos'
$NomeTarefaLogin = 'CentralEventos - Login'
$Atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'CentralEventos.lnk'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Ok([string]$t) { Write-Host "[OK]    $t" -ForegroundColor Green }
function Falha([string]$t) { Write-Host "[FALHA] $t" -ForegroundColor Red; $script:Falhas++ }
function Aviso([string]$t) { Write-Host "[AVISO] $t" -ForegroundColor Yellow }

function Nativo([string]$exe, [string]$argumentos) {
  # Executa um programa do Windows passando a linha de comando exatamente como escrita.
  # (Start-Process evita que mensagens em stderr virem erro fatal no PowerShell 5.1.)
  $out = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $argumentos -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $out -RedirectStandardError $err
    $texto = ((Get-Content -LiteralPath $out -Raw) + ' ' + (Get-Content -LiteralPath $err -Raw)).Trim()
    return @{ codigo = $p.ExitCode; saida = $texto }
  } finally {
    Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host '=== Central de Eventos - instalação nesta baia ===' -ForegroundColor Cyan
Write-Host "Baia: $env:COMPUTERNAME   Usuário: $env:USERNAME"
Write-Host ''

# 1. config.json ao lado do .bat ---------------------------------------------
$arqCfg = Join-Path $Origem 'config.json'
if (-not (Test-Path -LiteralPath $arqCfg)) {
  Falha "config.json não encontrado em $Origem. Copie o config.example.json para config.json e cole o token."
  exit 1
}
try {
  $cfg = [IO.File]::ReadAllText($arqCfg, [Text.Encoding]::UTF8) | ConvertFrom-Json
} catch {
  Falha "config.json inválido: $($_.Exception.Message)"
  exit 1
}
$token = [string]$cfg.token
if (-not $token -or $token -like 'COLE_AQUI*') {
  Falha 'o campo "token" do config.json não foi preenchido.'
  exit 1
}
if (-not $cfg.pasta -and -not $cfg.caminho_pasta) {
  Falha 'o campo "pasta" do config.json não foi preenchido.'
  exit 1
}
Ok "config.json lido (pasta: $($cfg.pasta), destino no site: $($cfg.destino))"

# 2. arquivos + config com token protegido -------------------------------------
try {
  New-Item -ItemType Directory -Path $Destino -Force | Out-Null
  foreach ($nome in @('publicar.ps1', 'executar-oculto.vbs')) {
    Copy-Item -LiteralPath (Join-Path $Origem $nome) -Destination $Destino -Force
    Unblock-File -LiteralPath (Join-Path $Destino $nome) -ErrorAction SilentlyContinue
  }
  $novo = [ordered]@{}
  foreach ($p in $cfg.PSObject.Properties) {
    if ($p.Name -ne 'token' -and $p.Name -ne 'token_protegido') { $novo[$p.Name] = $p.Value }
  }
  $novo.token_protegido = ConvertTo-SecureString $token -AsPlainText -Force | ConvertFrom-SecureString
  [IO.File]::WriteAllText((Join-Path $Destino 'config.json'), (ConvertTo-Json $novo -Depth 5), $Utf8)
  Ok "Arquivos copiados para $Destino (token guardado criptografado)"
} catch {
  Falha "não foi possível copiar os arquivos: $($_.Exception.Message)"
  exit 1
}

# 3. tarefa agendada ----------------------------------------------------------
$intervalo = 15
if ($cfg.intervalo_minutos) { $intervalo = [math]::Min([math]::Max([int]$cfg.intervalo_minutos, 5), 1440) }
$vbs = Join-Path $Destino 'executar-oculto.vbs'
$ps1 = Join-Path $Destino 'publicar.ps1'
if (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\wscript.exe')) {
  $exe = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $argumentos = '"' + $vbs + '"'
} else {
  # Sem VBScript (Windows futuro): chama o PowerShell direto; pode piscar uma janela.
  $exe = 'powershell.exe'
  $argumentos = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '"'
  Aviso 'wscript.exe não disponível — a tarefa chamará o PowerShell direto (pode piscar uma janela).'
}
$tr = ('"' + $exe + '" ' + $argumentos).Replace('"', '\"')

$r = Nativo 'schtasks.exe' "/Create /F /TN `"$NomeTarefa`" /SC MINUTE /MO $intervalo /RL LIMITED /TR `"$tr`""
if ($r.codigo -eq 0) {
  Ok "Tarefa '$NomeTarefa' a cada $intervalo minutos"
} else {
  try {
    $acao = New-ScheduledTaskAction -Execute $exe -Argument $argumentos -WorkingDirectory $Destino
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $intervalo)
    Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Force | Out-Null
    Ok "Tarefa '$NomeTarefa' a cada $intervalo minutos (via Register-ScheduledTask)"
  } catch {
    Falha "não foi possível criar a tarefa agendada: $($r.saida) / $($_.Exception.Message)"
  }
}

# 4. execução ao fazer login (3 tentativas, da melhor para a mais simples) ----
$login = $null
$r = Nativo 'schtasks.exe' "/Create /F /TN `"$NomeTarefaLogin`" /SC ONLOGON /RL LIMITED /TR `"$tr`""
if ($r.codigo -eq 0) {
  $login = 'tarefa agendada (schtasks)'
} else {
  try {
    $usuario = "$env:USERDOMAIN\$env:USERNAME"
    Register-ScheduledTask -TaskName $NomeTarefaLogin -Force `
      -Action (New-ScheduledTaskAction -Execute $exe -Argument $argumentos -WorkingDirectory $Destino) `
      -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $usuario) `
      -Principal (New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited) `
      -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) |
      Out-Null
    $login = 'tarefa agendada (Register-ScheduledTask)'
  } catch {
    try {
      $sh = New-Object -ComObject WScript.Shell
      $lnk = $sh.CreateShortcut($Atalho)
      $lnk.TargetPath = $exe
      $lnk.Arguments = $argumentos
      $lnk.WorkingDirectory = $Destino
      $lnk.WindowStyle = 7
      $lnk.Description = 'Central de Eventos - publica a pasta do SharePoint no site'
      $lnk.Save()
      $login = 'atalho na pasta Inicialização'
    } catch {
      Falha "não foi possível configurar a execução ao fazer login: $($_.Exception.Message)"
    }
  }
}
if ($login) {
  Ok "Execução ao fazer login: $login"
  if ($login -notlike 'atalho*' -and (Test-Path -LiteralPath $Atalho)) { Remove-Item -LiteralPath $Atalho -Force }
}

# 5. diagnóstico + teste sem publicar -----------------------------------------
Write-Host ''
Write-Host '--- Diagnóstico (nada é publicado agora) ---' -ForegroundColor Cyan
& $ps1 -Diagnostico
if ($LASTEXITCODE -ne 0) { $script:Falhas++ }

Write-Host ''
if ($script:Falhas -eq 0) {
  Write-Host '=== INSTALAÇÃO CONCLUÍDA ===' -ForegroundColor Green
  Write-Host "A tarefa publica sozinha a cada $intervalo minutos (a primeira em até $intervalo min)."
  Write-Host "Para publicar agora:   schtasks /Run /TN $NomeTarefa"
} else {
  Write-Host "=== INSTALAÇÃO COM $($script:Falhas) FALHA(S) — veja as linhas [FALHA] acima ===" -ForegroundColor Red
}
Write-Host "Log:                   $Destino\log.txt"
Write-Host ''
Write-Host 'Lembrete: o config.json ao lado do instalar.bat tem o token em texto puro.' -ForegroundColor Yellow
Write-Host 'Guarde-o em local seguro (ou apague) depois de instalar em todas as baias.' -ForegroundColor Yellow
exit $script:Falhas
