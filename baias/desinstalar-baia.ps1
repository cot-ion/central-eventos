<#
  Remove a publicação automática da Central de Eventos desta baia.
  Chamado pelo desinstalar.bat. Não precisa de administrador.
#>
$ErrorActionPreference = 'Stop'
$script:Falhas = 0
$Destino = Join-Path $env:LOCALAPPDATA 'CentralEventos'
$Atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'CentralEventos.lnk'

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
Write-Host '=== Central de Eventos - desinstalação ===' -ForegroundColor Cyan

foreach ($nome in @('CentralEventos', 'CentralEventos - Login')) {
  $r = Nativo 'schtasks.exe' "/Query /TN `"$nome`""
  if ($r.codigo -ne 0) { continue }   # não existe
  $r = Nativo 'schtasks.exe' "/Delete /F /TN `"$nome`""
  if ($r.codigo -eq 0) { Ok "Tarefa '$nome' removida" }
  else {
    try { Unregister-ScheduledTask -TaskName $nome -Confirm:$false; Ok "Tarefa '$nome' removida" }
    catch { Falha "Tarefa '$nome': $($r.saida)" }
  }
}

if (Test-Path -LiteralPath $Atalho) {
  Remove-Item -LiteralPath $Atalho -Force
  Ok 'Atalho da pasta Inicialização removido'
}

if (Test-Path -LiteralPath $Destino) {
  try {
    Remove-Item -LiteralPath $Destino -Recurse -Force
    Ok "Pasta $Destino removida (inclui o token criptografado e o log)"
  } catch {
    Falha "não foi possível apagar $Destino (uma execução está em andamento? tente de novo em 1 minuto): $($_.Exception.Message)"
  }
}

Write-Host ''
if ($script:Falhas -eq 0) { Write-Host '=== DESINSTALADO ===' -ForegroundColor Green }
else { Write-Host '=== DESINSTALAÇÃO INCOMPLETA ===' -ForegroundColor Red }
Write-Host 'O token continua válido no GitHub. Revogue-o lá só se nenhuma outra baia o usar.'
exit $script:Falhas
