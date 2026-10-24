<#
.SYNOPSIS
  Verifica se esta máquina consegue fazer tudo o que a sincronização precisa:
  acessar o GitHub (passando pelo proxy), clonar o repositório, dar push com
  o token e baixar o python-pptx do PyPI. Não altera nada no site.

.DESCRIPTION
  O teste de escrita cria um branch temporário "teste-conexao-<máquina>-<hora>",
  envia um commit vazio para ele e o apaga em seguida. O branch main não é tocado.

  Na primeira vez o Git abre uma janela pedindo login: use o seu usuário do
  GitHub e cole o TOKEN no campo de senha (ver README, passo 1). O Gerenciador
  de Credenciais do Windows guarda o token para as próximas execuções.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\teste_conexao.ps1
#>
param(
  [string]$Repo = "https://github.com/cot-ion/central-eventos.git",
  [switch]$PularEscrita
)

$ErrorActionPreference = "Continue"
$resultados = New-Object System.Collections.Generic.List[object]

function Registrar($etapa, $ok, $detalhe) {
  $resultados.Add([pscustomobject]@{ Etapa = $etapa; Resultado = $(if ($ok) { "OK" } else { "FALHOU" }); Detalhe = $detalhe })
  $cor = if ($ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} {2}" -f $(if ($ok) { " OK " } else { "ERRO" }), $etapa, $(if ($detalhe) { "- $detalhe" } else { "" })) -ForegroundColor $cor
}

function Rodar($exe, [string[]]$argumentos) {
  # Executa um programa e devolve @(codigo, saida) sem interromper o script.
  $env:GIT_TERMINAL_PROMPT = "0"
  $saida = & $exe @argumentos 2>&1 | Out-String
  return @($LASTEXITCODE, $saida.Trim())
}

Write-Host ""
Write-Host "=== Teste de conexão — Central de Eventos ===" -ForegroundColor Cyan
Write-Host "Máquina: $env:COMPUTERNAME   Usuário: $env:USERNAME   Repositório: $Repo"
Write-Host ""

# 1. Proxy -----------------------------------------------------------------
$proxySistema = $null
try {
  $p = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy([uri]"https://github.com")
  if ($p.Host -ne "github.com") { $proxySistema = $p.AbsoluteUri }
} catch {}
$winhttp = (netsh winhttp show proxy) -join " "
Write-Host "Proxy do Windows (usuário): $(if ($proxySistema) { $proxySistema } else { 'nenhum / direto' })"
Write-Host "Proxy WinHTTP: $(($winhttp -replace '\s+', ' ').Trim())"
if ($env:HTTPS_PROXY) { Write-Host "Variável HTTPS_PROXY: $env:HTTPS_PROXY" }

# 2. HTTPS até o GitHub ------------------------------------------------------
foreach ($url in @("https://github.com", "https://api.github.com", "https://pypi.org/simple/python-pptx/")) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 -Method Head -UseDefaultCredentials
    Registrar "HTTPS $url" $true "HTTP $($r.StatusCode)"
  } catch {
    Registrar "HTTPS $url" $false $_.Exception.Message
  }
}

# 3. Programas -------------------------------------------------------------
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
  $v = Rodar "git" @("--version")
  Registrar "Git instalado" $true $v[1]
  $ssl = (Rodar "git" @("config", "--global", "--get", "http.sslBackend"))[1]
  $gproxy = (Rodar "git" @("config", "--global", "--get", "http.proxy"))[1]
  Write-Host "     git http.sslBackend = $(if ($ssl) { $ssl } else { '(padrão)' })   git http.proxy = $(if ($gproxy) { $gproxy } else { '(nenhum)' })"
} else {
  Registrar "Git instalado" $false "instale o Git for Windows ou o PortableGit (ver README)"
}

$py = $null
foreach ($cand in @("py", "python")) {
  $c = Get-Command $cand -ErrorAction SilentlyContinue
  if ($c -and $c.Source -notlike "*WindowsApps*") { $py = $cand; break }
}
if ($py) {
  $verArgs = if ($py -eq "py") { @("-3", "--version") } else { @("--version") }
  $v = Rodar $py $verArgs
  Registrar "Python instalado" ($v[0] -eq 0) $v[1]
  $tmpPip = Join-Path $env:TEMP "teste-pip-central-eventos"
  $pipArgs = @()
  if ($py -eq "py") { $pipArgs += "-3" }
  $pipArgs += @("-m", "pip", "download", "python-pptx==1.0.2", "--no-deps", "--quiet", "-d", $tmpPip)
  $v = Rodar $py $pipArgs
  Registrar "pip baixa o python-pptx (PyPI)" ($v[0] -eq 0) $(if ($v[0] -ne 0) { $v[1] } else { "" })
  Remove-Item -Recurse -Force $tmpPip -ErrorAction SilentlyContinue
} else {
  Registrar "Python instalado" $false "instale o Python 3.10+ de python.org (opção 'para este usuário' não exige admin)"
}

# 4. Git: leitura, clone e escrita -------------------------------------------
if ($git) {
  $v = Rodar "git" @("ls-remote", "--heads", $Repo)
  Registrar "git ls-remote (leitura)" ($v[0] -eq 0) $(if ($v[0] -ne 0) { $v[1] } else { "" })

  $dir = Join-Path $env:TEMP ("teste-clone-central-eventos-" + (Get-Date -Format "yyyyMMddHHmmss"))
  $v = Rodar "git" @("clone", "--quiet", "--depth", "1", $Repo, $dir)
  $clonou = $v[0] -eq 0
  Registrar "git clone" $clonou $(if (-not $clonou) { $v[1] } else { "" })

  if ($clonou -and -not $PularEscrita) {
    $env:GIT_TERMINAL_PROMPT = $null  # aqui pode abrir a janela de login, de propósito
    $branch = "teste-conexao-$($env:COMPUTERNAME.ToLower())-$(Get-Date -Format 'yyyyMMddHHmmss')"
    & git -C $dir checkout --quiet -b $branch 2>&1 | Out-Null
    & git -C $dir -c user.name="Teste conexao" -c user.email="teste@invalid" commit --quiet --allow-empty -m "Teste de conexão de $env:COMPUTERNAME (pode apagar)" 2>&1 | Out-Null
    $saida = & git -C $dir push --quiet origin $branch 2>&1 | Out-String
    $ok = $LASTEXITCODE -eq 0
    Registrar "git push (escrita com o token)" $ok $(if (-not $ok) { $saida.Trim() } else { "branch $branch criado" })
    if ($ok) {
      $saida = & git -C $dir push --quiet origin --delete $branch 2>&1 | Out-String
      Registrar "apagar branch de teste" ($LASTEXITCODE -eq 0) $(if ($LASTEXITCODE -ne 0) { "apague $branch manualmente no GitHub: $($saida.Trim())" } else { "" })
    }
  }
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}

# Resumo -------------------------------------------------------------------
Write-Host ""
$falhas = @($resultados | Where-Object { $_.Resultado -eq "FALHOU" })
if ($falhas.Count -eq 0) {
  Write-Host "Tudo certo: esta máquina pode rodar a sincronização." -ForegroundColor Green
} else {
  Write-Host "$($falhas.Count) verificação(ões) falharam. Dicas:" -ForegroundColor Yellow
  $texto = ($falhas | ForEach-Object { $_.Detalhe }) -join " "
  if ($texto -match "SSL|certificate|certificado") {
    Write-Host " - Certificado: rode  git config --global http.sslBackend schannel  (usa os certificados do Windows/empresa)."
  }
  if ($texto -match "proxy|resolve|timed out|tempo limite|Unable to connect|não foi possível") {
    Write-Host " - Proxy: rode  git config --global http.proxy http://ENDERECO:PORTA  (o endereço aparece acima em 'Proxy do Windows')."
    Write-Host "   Para o pip: defina HTTPS_PROXY ou use  pip --proxy http://ENDERECO:PORTA ..."
  }
  if ($texto -match "403|401|denied|Authentication|could not read") {
    Write-Host " - Permissão: confira se o token tem 'Contents: Read and write' neste repositório e não expirou."
    Write-Host "   Para trocar o token salvo: Gerenciador de Credenciais > Credenciais do Windows > git:https://github.com > Remover."
  }
  Write-Host " - Se o GitHub estiver bloqueado pela rede, será preciso pedir liberação de github.com (porta 443)."
}
$log = Join-Path $PSScriptRoot "teste_conexao_resultado.txt"
$resultados | Format-Table -AutoSize -Wrap | Out-String -Width 200 | Set-Content -Encoding UTF8 $log
Write-Host ""
Write-Host "Resultado salvo em $log"
