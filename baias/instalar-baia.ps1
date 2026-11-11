<#
  Instala a publicação automática da Central de Eventos nesta baia.
  Chamado pelo instalar.bat. Não precisa de administrador.

  1. copia publicar.ps1 e executar-oculto.vbs para %LOCALAPPDATA%\CentralEventos
  2. guarda o config.json com o token criptografado (DPAPI: só este usuário lê)
  3. cria a tarefa agendada (a cada N minutos) e a execução ao fazer login.
     O nome leva o usuário ("CentralEventos - fulano"): no Windows o nome da
     tarefa é único por computador, e baias são compartilhadas. Se o Windows
     negar a criação de tarefas, usa o "modo em segundo plano": um atalho na
     pasta Inicialização mantém o publicar.ps1 rodando (-Laco) enquanto o
     usuário estiver logado.
  4. roda um diagnóstico com [OK]/[FALHA] e um teste sem publicar (DryRun)

  Rodar de novo é seguro: serve para trocar o token ou mudar a configuração.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:Falhas = 0

$Origem = $PSScriptRoot
$Destino = Join-Path $env:LOCALAPPDATA 'CentralEventos'
$Usuario = $env:USERNAME -replace '[\\/:*?"<>|]', '_'
$NomeTarefa = "CentralEventos - $Usuario"
$NomeTarefaLogin = "CentralEventos - Login - $Usuario"
$NomesAntigos = @('CentralEventos', 'CentralEventos - Login')   # instalações anteriores a esta versão
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
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# Padrão: a tarefa chama o PowerShell direto (pode piscar uma janela por um instante).
# O executar-oculto.vbs evita a janela, mas antivírus corporativos (ex.: Kaspersky,
# regra "Start of PowerShell from the VBScript script") bloqueiam VBScript abrindo
# PowerShell — por isso só é usado com "ocultar_com_vbs": true no config.json.
$argumentosPs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '"'
$exe = $powershell
$argumentos = $argumentosPs
if ($cfg.ocultar_com_vbs -eq $true -and (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\wscript.exe'))) {
  $exe = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $argumentos = '"' + $vbs + '"'
  Aviso 'usando executar-oculto.vbs (ocultar_com_vbs = true).'
}
$tr = ('"' + $exe + '" ' + $argumentos).Replace('"', '\"')

# Para um modo em segundo plano de uma instalação anterior (só processos deste usuário).
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*CentralEventos*publicar.ps1*-Laco*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Remove tarefas com o nome antigo, só se forem deste usuário.
foreach ($antigo in $NomesAntigos) {
  try {
    $t = Get-ScheduledTask -TaskName $antigo -ErrorAction Stop | Select-Object -First 1
    if ($t -and ($t.Principal.UserId -split '\\')[-1] -eq $env:USERNAME) {
      Unregister-ScheduledTask -TaskName $antigo -Confirm:$false -ErrorAction Stop
      Ok "Tarefa antiga '$antigo' substituída por '$NomeTarefa'"
    }
  } catch { }
}

$temTarefa = $false
$r = Nativo 'schtasks.exe' "/Create /F /TN `"$NomeTarefa`" /SC MINUTE /MO $intervalo /RL LIMITED /TR `"$tr`""
if ($r.codigo -eq 0) {
  $temTarefa = $true
  Ok "Tarefa '$NomeTarefa' a cada $intervalo minutos"
} else {
  try {
    $acao = New-ScheduledTaskAction -Execute $exe -Argument $argumentos -WorkingDirectory $Destino
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $intervalo)
    Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Force | Out-Null
    $temTarefa = $true
    Ok "Tarefa '$NomeTarefa' a cada $intervalo minutos (via Register-ScheduledTask)"
  } catch {
    Aviso "o Windows não deixou criar a tarefa agendada ($($r.saida)). Usando o modo em segundo plano."
  }
}

# 4. execução ao fazer login --------------------------------------------------
function Criar-Atalho([string]$argumentosAtalho) {
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($Atalho)
  $lnk.TargetPath = $powershell
  $lnk.Arguments = $argumentosAtalho
  $lnk.WorkingDirectory = $Destino
  $lnk.WindowStyle = 7
  $lnk.Description = 'Central de Eventos - publica a pasta do SharePoint no site'
  $lnk.Save()
}

$emSegundoPlano = $false
if ($temTarefa) {
  # Com a tarefa periódica funcionando, só falta rodar também ao fazer login (3 tentativas).
  $login = $null
  $r = Nativo 'schtasks.exe' "/Create /F /TN `"$NomeTarefaLogin`" /SC ONLOGON /RL LIMITED /TR `"$tr`""
  if ($r.codigo -eq 0) {
    $login = 'tarefa agendada (schtasks)'
  } else {
    try {
      $contaLogin = "$env:USERDOMAIN\$env:USERNAME"   # (não chamar de $usuario: o PowerShell não diferencia de $Usuario)
      Register-ScheduledTask -TaskName $NomeTarefaLogin -Force `
        -Action (New-ScheduledTaskAction -Execute $exe -Argument $argumentos -WorkingDirectory $Destino) `
        -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $contaLogin) `
        -Principal (New-ScheduledTaskPrincipal -UserId $contaLogin -LogonType Interactive -RunLevel Limited) `
        -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) |
        Out-Null
      $login = 'tarefa agendada (Register-ScheduledTask)'
    } catch {
      try {
        Criar-Atalho $argumentosPs
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
} else {
  # Modo em segundo plano: o atalho da Inicialização abre o publicar.ps1 em laço
  # (confere a pasta a cada N minutos enquanto o usuário estiver logado).
  $argumentosLaco = $argumentosPs + ' -Laco'
  try {
    Criar-Atalho $argumentosLaco
    $emSegundoPlano = $true   # o laço é iniciado depois do diagnóstico, para não disputar a trava com ele
    Ok "Modo em segundo plano: confere a pasta a cada $intervalo minutos enquanto você estiver logado (atalho na pasta Inicialização)"
  } catch {
    Falha "não foi possível ativar o modo em segundo plano: $($_.Exception.Message)"
  }
}

# 5. diagnóstico + teste sem publicar -----------------------------------------
Write-Host ''
Write-Host '--- Diagnóstico (nada é publicado agora) ---' -ForegroundColor Cyan
& $ps1 -Diagnostico
if ($LASTEXITCODE -ne 0) { $script:Falhas++ }
if ($emSegundoPlano) {
  Start-Process -FilePath $powershell -ArgumentList $argumentosLaco -WindowStyle Hidden -WorkingDirectory $Destino
}

Write-Host ''
if ($script:Falhas -eq 0) {
  Write-Host '=== INSTALAÇÃO CONCLUÍDA ===' -ForegroundColor Green
  Write-Host "A publicação roda sozinha a cada $intervalo minutos (a primeira em até $intervalo min)."
  if ($temTarefa) { Write-Host "Para publicar agora:   schtasks /Run /TN `"$NomeTarefa`"" }
} else {
  Write-Host "=== INSTALAÇÃO COM $($script:Falhas) FALHA(S) — veja as linhas [FALHA] acima ===" -ForegroundColor Red
}
Write-Host "Log:                   $Destino\log.txt"
Write-Host ''
Write-Host 'Lembrete: o config.json ao lado do instalar.bat tem o token em texto puro.' -ForegroundColor Yellow
Write-Host 'Guarde-o em local seguro (ou apague) depois de instalar em todas as baias.' -ForegroundColor Yellow
exit $script:Falhas
