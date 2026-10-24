<#
.SYNOPSIS
  Confere a pasta do SharePoint (sincronizada pelo OneDrive) e publica no
  GitHub os .pptx que mudaram. Roda escondido a cada 15 minutos em cada baia.

.DESCRIPTION
  1. Acha a pasta configurada dentro do perfil do usuário.
  2. Lista os .pptx só por nome, tamanho e data (não abre os arquivos, então o
     OneDrive não baixa nada).
  3. Compara com o manifesto que está NO REPOSITÓRIO (<destino>/manifest.json),
     o mesmo para todas as baias.
  4. Sem mudanças: encerra (1–2 s). Com mudanças: lê só os arquivos alterados e
     publica tudo em UM commit pela Git Data API, junto com o manifesto novo.
     O GitHub Actions então converte os .pptx e republica o site.

  Não precisa de administrador. Log: %LOCALAPPDATA%\CentralEventos\log.txt

.PARAMETER DryRun
  Mostra o que seria publicado, sem publicar.
.PARAMETER Diagnostico
  Testa conexão, token, permissão de escrita e pasta, mostrando [OK]/[FALHA],
  e termina com um DryRun. Usado pelo instalar.bat.
.PARAMETER Forcar
  Publica remoções mesmo acima do limite de segurança (limite_remocao_pct).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\CentralEventos\publicar.ps1" -DryRun
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Diagnostico,
  [switch]$Forcar,
  [string]$Config = ""
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # a barra de progresso deixa o Invoke-WebRequest MUITO lento no PS 5.1

$Base = Join-Path $env:LOCALAPPDATA 'CentralEventos'
if (-not $Config) { $Config = Join-Path $PSScriptRoot 'config.json' }
$ArqLog = Join-Path $Base 'log.txt'
$ArqEstado = Join-Path $Base 'estado.json'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Baia = $env:COMPUTERNAME
$script:TokenExpira = $null
$script:BlobsEnviados = @{}
if ($Diagnostico) { $DryRun = $true }

# ---------------------------------------------------------------- log ---

function Log([string]$nivel, [string]$msg, [switch]$SoArquivo) {
  $prefixo = if ($DryRun) { '[DRY] ' } else { '' }
  $linha = '{0} {1,-5} {2}{3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $nivel, $prefixo, $msg
  try {
    if (-not (Test-Path -LiteralPath $Base)) { New-Item -ItemType Directory -Path $Base -Force | Out-Null }
    [IO.File]::AppendAllText($ArqLog, $linha + "`r`n", $Utf8)
  } catch { }
  if ($SoArquivo) { return }
  switch ($nivel) {
    'ERRO'  { Write-Host $linha -ForegroundColor Red }
    'AVISO' { Write-Host $linha -ForegroundColor Yellow }
    default { Write-Host $linha }
  }
}

function Girar-Log {
  # Mantém só as últimas ~500 linhas.
  try {
    if (Test-Path -LiteralPath $ArqLog) {
      $linhas = [IO.File]::ReadAllLines($ArqLog, $Utf8)
      if ($linhas.Count -gt 600) { [IO.File]::WriteAllLines($ArqLog, $linhas[-500..-1], $Utf8) }
    }
  } catch { }
}

function Resultado([bool]$ok, [string]$texto) {
  # Saída no estilo do teste: [OK] / [FALHA]
  if ($ok) { Write-Host "[OK]    $texto" -ForegroundColor Green }
  else { Write-Host "[FALHA] $texto" -ForegroundColor Red }
  Log $(if ($ok) { 'INFO' } else { 'ERRO' }) ("diagnóstico: " + $(if ($ok) { 'OK' } else { 'FALHA' }) + " - $texto") -SoArquivo
}

# ------------------------------------------------------- configuração ---

function Valor($obj, [string]$nome, $padrao) {
  if ($null -ne $obj -and $obj.PSObject.Properties[$nome] -and $null -ne $obj.$nome -and "$($obj.$nome)" -ne '') {
    return $obj.$nome
  }
  return $padrao
}

function Ler-Json([string]$caminho) {
  if (-not (Test-Path -LiteralPath $caminho)) { return $null }
  $texto = [IO.File]::ReadAllText($caminho, [Text.Encoding]::UTF8)  # aceita com ou sem BOM
  if (-not $texto.Trim()) { return $null }
  return ($texto | ConvertFrom-Json)
}

function Gravar-Json([string]$caminho, $obj) {
  [IO.File]::WriteAllText($caminho, (ConvertTo-Json $obj -Depth 10), $Utf8)
}

function Ler-Token($cfg) {
  $protegido = Valor $cfg 'token_protegido' ''
  if ($protegido) {
    # Criptografado pelo instalar.bat com o DPAPI: só este usuário, nesta máquina, consegue ler.
    $seguro = ConvertTo-SecureString $protegido
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
  return (Valor $cfg 'token' '')
}

function Iso([datetime]$data) {
  return $data.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [Globalization.CultureInfo]::InvariantCulture)
}

function Novo-Dicionario {
  # Chaves sem diferenciar maiúsculas (como o Windows trata nomes de arquivo).
  # A vírgula impede o PowerShell de "desenrolar" o dicionário vazio em $null.
  return , (New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::OrdinalIgnoreCase))
}

# ---------------------------------------------------------------- rede ---

function Configurar-Rede {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  if ($null -ne [Net.WebRequest]::DefaultWebProxy) {
    [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
  }
}

function Caminho-Url([string]$caminho) {
  # Escapa cada pedaço do caminho (acentos, espaços) para a URL.
  return (($caminho -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
}

function GitHub([string]$metodo, [string]$caminho, $corpo = $null) {
  $uri = "https://api.github.com/repos/$($script:Repo)"
  if ($caminho) { $uri = "$uri/$caminho" }
  $parametros = @{
    Uri             = $uri
    Method          = $metodo
    Headers         = @{
      Authorization          = "Bearer $($script:Token)"
      Accept                 = 'application/vnd.github+json'
      'X-GitHub-Api-Version' = '2022-11-28'
    }
    UserAgent       = "CentralEventos-Baia/$Baia"
    UseBasicParsing = $true
    TimeoutSec      = 120
  }
  if ($null -ne $corpo) {
    $json = if ($corpo -is [string]) { $corpo } else { ConvertTo-Json $corpo -Depth 10 -Compress }
    $parametros.Body = $Utf8.GetBytes($json)
    $parametros.ContentType = 'application/json; charset=utf-8'
  }
  try {
    $resposta = Invoke-WebRequest @parametros
  } catch [System.Net.WebException] {
    $r = $_.Exception.Response
    if ($null -eq $r) {
      $e = New-Object System.Exception("sem conexão com api.github.com ($($_.Exception.Message)) — rede ou proxy?")
      $e.Data['status'] = 0
      throw $e
    }
    $status = [int]$r.StatusCode
    # No PS 5.1 o corpo da resposta de erro fica em ErrorDetails.Message.
    $texto = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $texto = $_.ErrorDetails.Message }
    else { try { $texto = (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() } catch { } }
    try { $j = $texto | ConvertFrom-Json; if ($j.message) { $texto = "GitHub: $($j.message)" } } catch { }
    $dica = ''
    if ($status -eq 401) { $dica = ' — token inválido ou expirado (ver README: renovar o token)' }
    elseif ($status -eq 403) { $dica = ' — o token não pode escrever neste repositório. Confira no GitHub: (1) token criado pela conta dona do repositório (Resource owner = cot-ion); (2) Repository access = Only select repositories → central-eventos; (3) Contents = Read and write' }
    elseif ($status -eq 404) { $dica = ' — não encontrado (repositório/branch/token sem acesso ao repositório?)' }
    $e = New-Object System.Exception("GitHub $metodo $caminho → HTTP $status$dica. $texto")
    $e.Data['status'] = $status
    throw $e
  }
  $expira = $resposta.Headers['github-authentication-token-expiration']
  if ($expira) { $script:TokenExpira = [string]$expira }
  if ($resposta.Content) {
    $conteudo = $resposta.Content
    if ($conteudo -is [byte[]]) { $conteudo = $Utf8.GetString($conteudo) }
    return ($conteudo | ConvertFrom-Json)
  }
  return $null
}

function Status-Http($erro) {
  $ex = $erro
  if ($erro -is [System.Management.Automation.ErrorRecord]) { $ex = $erro.Exception }
  if ($ex.Data.Contains('status')) { return [int]$ex.Data['status'] }
  return -1
}

function Data-Token {
  # Cabeçalho do GitHub: "2027-10-24 12:00:00 UTC"
  if (-not $script:TokenExpira) { return $null }
  $texto = $script:TokenExpira -replace '\s*UTC$', ''
  $data = [datetime]::MinValue
  $estilos = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
  foreach ($formato in @('yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm:ss zzz', "yyyy-MM-dd'T'HH:mm:ss'Z'")) {
    if ([datetime]::TryParseExact($texto, $formato, [Globalization.CultureInfo]::InvariantCulture, $estilos, [ref]$data)) {
      return $data
    }
  }
  return $null
}

# --------------------------------------------------------------- pasta ---

function Achar-Pasta($cfg, $estado) {
  $explicito = Valor $cfg 'caminho_pasta' ''
  if ($explicito) {
    if (Test-Path -LiteralPath $explicito -PathType Container) { return (Get-Item -LiteralPath $explicito).FullName.TrimEnd('\') }
    throw "caminho_pasta '$explicito' não existe"
  }
  $nome = Valor $cfg 'pasta' ''
  if (-not $nome) { throw "config.json sem o campo 'pasta'" }

  # Caminho achado antes (evita refazer a busca a cada 15 min).
  $anterior = Valor $estado 'pasta' ''
  if ($anterior -and (Split-Path -Leaf $anterior) -eq $nome -and (Test-Path -LiteralPath $anterior -PathType Container)) {
    return $anterior
  }

  $profundidade = [int](Valor $cfg 'profundidade_busca' 4)
  $contem = Valor $cfg 'caminho_contem' ''
  Log 'INFO' "procurando a pasta '$nome' em $env:USERPROFILE (até $profundidade níveis)..."
  # Sem -Force: pula pastas ocultas como AppData.
  $raizes = @(Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -ErrorAction SilentlyContinue)
  $achados = New-Object System.Collections.ArrayList
  foreach ($raiz in $raizes) {
    if ($raiz.Name -eq $nome) { [void]$achados.Add($raiz.FullName) }
    if ($profundidade -ge 2) {
      Get-ChildItem -LiteralPath $raiz.FullName -Directory -Recurse -Depth ($profundidade - 2) -Filter $nome -ErrorAction SilentlyContinue |
        ForEach-Object { if ($_.Name -eq $nome) { [void]$achados.Add($_.FullName) } }
    }
  }
  $lista = @($achados | Select-Object -Unique)
  if ($contem) { $lista = @($lista | Where-Object { $_ -like "*$contem*" }) }
  if ($lista.Count -eq 0) {
    throw "pasta '$nome' não encontrada em $env:USERPROFILE. O OneDrive está sincronizando a biblioteca do SharePoint nesta baia?"
  }
  if ($lista.Count -gt 1) {
    throw ("mais de uma pasta '$nome' encontrada; preencha 'caminho_contem' no config.json para escolher: " + ($lista -join ' | '))
  }
  return $lista[0].TrimEnd('\')
}

function Listar-Pptx([string]$pasta) {
  # Só metadados: nome, tamanho e data. Não abre os arquivos (Arquivos Sob Demanda continuam na nuvem).
  $arquivos = New-Object System.Collections.ArrayList
  foreach ($f in Get-ChildItem -LiteralPath $pasta -Recurse -File -Filter '*.pptx' -ErrorAction Stop) {
    if ($f.Name -like '~$*' -or $f.Name.StartsWith('.')) { continue }   # ~$ = arquivo aberto no PowerPoint
    if ($f.Extension -ne '.pptx') { continue }
    $rel = $f.FullName.Substring($pasta.Length).TrimStart('\') -replace '\\', '/'
    [void]$arquivos.Add([pscustomobject]@{
        rel        = $rel
        caminho    = $f.FullName
        tamanho    = [int64]$f.Length
        data       = $f.LastWriteTimeUtc
        modificado = Iso $f.LastWriteTimeUtc
      })
  }
  return , $arquivos
}

function Sha-Blob([byte[]]$bytes) {
  # Mesmo hash que o git usa ("blob <tamanho>\0<conteúdo>").
  $cabecalho = [Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)`0")
  $sha1 = [Security.Cryptography.SHA1]::Create()
  try {
    [void]$sha1.TransformBlock($cabecalho, 0, $cabecalho.Length, $null, 0)
    [void]$sha1.TransformFinalBlock($bytes, 0, $bytes.Length)
    return (($sha1.Hash | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { $sha1.Dispose() }
}

# ---------------------------------------------------------- comparação ---

function Ler-Manifesto([string]$ref) {
  # Lê <destino>/manifest.json do repositório no commit/branch indicado.
  $arquivos = Novo-Dicionario
  try {
    $c = GitHub 'GET' ("contents/" + (Caminho-Url "$($script:Destino)/manifest.json") + "?ref=" + [Uri]::EscapeDataString($ref))
  } catch {
    if ((Status-Http $_) -eq 404) { return , $arquivos }   # primeira publicação
    throw
  }
  $texto = $Utf8.GetString([Convert]::FromBase64String(($c.content -replace '\s', '')))
  $texto = $texto.TrimStart([char]0xFEFF)
  $m = $texto | ConvertFrom-Json
  if ($null -ne $m.arquivos) {
    foreach ($p in $m.arquivos.PSObject.Properties) { $arquivos[$p.Name] = $p.Value }
  }
  return , $arquivos
}

function Comparar($locais, $manifesto, $cache) {
  # Devolve o que enviar e o que remover. Não lê arquivos, exceto para
  # confirmar (por hash) os que só mudaram de data — e guarda o hash no cache
  # local para não reler na próxima rodada.
  $enviar = New-Object System.Collections.ArrayList
  $remover = New-Object System.Collections.ArrayList
  $vistos = Novo-Dicionario
  $agora = (Get-Date).ToUniversalTime()
  $limite = [int64](Valor $script:Cfg 'tamanho_maximo_mb' 50) * 1MB

  foreach ($f in $locais) {
    $vistos[$f.rel] = $true
    $antes = $null
    if ($manifesto.ContainsKey($f.rel)) { $antes = $manifesto[$f.rel] }

    if ($antes -and [int64]$antes.tamanho -eq $f.tamanho -and [string]$antes.modificado -eq $f.modificado) { continue }
    if (($agora - $f.data).TotalSeconds -lt 120) {
      Log 'INFO' "$($f.rel): salvo há menos de 2 min — aguardando a próxima rodada"
      continue
    }
    if ($f.tamanho -gt $limite) {
      Log 'AVISO' ("$($f.rel): {0:N1} MB, acima de tamanho_maximo_mb — ignorado" -f ($f.tamanho / 1MB))
      continue
    }
    if ($antes -and [int64]$antes.tamanho -eq $f.tamanho) {
      # Mesmo tamanho, data diferente: pode ser a mesma versão vista com outra data em outra baia.
      $chave = "$($f.tamanho)|$($f.modificado)"
      $sha = $null
      if ($cache.ContainsKey($f.rel) -and ([string]$cache[$f.rel]).StartsWith("$chave|")) {
        $sha = ([string]$cache[$f.rel]).Split('|')[2]
      } else {
        try { $sha = Sha-Blob ([IO.File]::ReadAllBytes($f.caminho)) }
        catch { Log 'AVISO' "$($f.rel): não foi possível ler ($($_.Exception.Message)) — tento na próxima rodada"; continue }
        $cache[$f.rel] = "$chave|$sha"
      }
      if ($sha -eq [string]$antes.sha) { continue }   # conteúdo igual ao publicado
    }
    [void]$enviar.Add($f)
  }

  if ([bool](Valor $script:Cfg 'espelhar_remocoes' $true)) {
    foreach ($rel in $manifesto.Keys) { if (-not $vistos.ContainsKey($rel)) { [void]$remover.Add($rel) } }
  }
  return @{ enviar = $enviar; remover = $remover }
}

# ----------------------------------------------------------- publicação ---

function Montar-Manifesto($anterior, $enviados, $removidos) {
  $novo = Novo-Dicionario
  foreach ($k in $anterior.Keys) { $novo[$k] = $anterior[$k] }
  foreach ($k in $removidos) { [void]$novo.Remove($k) }
  foreach ($e in $enviados) { $novo[$e.rel] = $e.entrada }
  $ordenado = [ordered]@{}
  foreach ($k in ($novo.Keys | Sort-Object)) { $ordenado[$k] = $novo[$k] }
  $m = [ordered]@{
    versao         = 1
    atualizado_em  = Iso (Get-Date)
    atualizado_por = $Baia
  }
  $dataToken = Data-Token
  if ($dataToken) { $m.token_expira_em = Iso $dataToken }
  $m.arquivos = $ordenado
  return (ConvertTo-Json $m -Depth 10)
}

function Publicar($mudancas, $manifesto, [string]$headSha) {
  $commitBase = GitHub 'GET' "git/commits/$headSha"
  $arvore = New-Object System.Collections.ArrayList
  $enviados = New-Object System.Collections.ArrayList

  foreach ($f in $mudancas.enviar) {
    $bytes = [IO.File]::ReadAllBytes($f.caminho)   # aqui o OneDrive baixa o arquivo, se ainda não estiver no disco
    $sha = Sha-Blob $bytes
    if (-not $script:BlobsEnviados.ContainsKey($sha)) {
      # JSON montado à mão: ConvertTo-Json é lento demais com strings grandes.
      $blob = GitHub 'POST' 'git/blobs' ('{"encoding":"base64","content":"' + [Convert]::ToBase64String($bytes) + '"}')
      if ($blob.sha -ne $sha) { throw "hash do blob enviado ($($blob.sha)) diferente do calculado ($sha) para $($f.rel)" }
      $script:BlobsEnviados[$sha] = $true
    }
    $bytes = $null
    [void]$arvore.Add(@{ path = "$($script:Destino)/$($f.rel)"; mode = '100644'; type = 'blob'; sha = $sha })
    [void]$enviados.Add(@{
        rel     = $f.rel
        entrada = [ordered]@{ tamanho = $f.tamanho; modificado = $f.modificado; sha = $sha; enviado_em = Iso (Get-Date); enviado_por = $Baia }
      })
  }
  foreach ($rel in $mudancas.remover) {
    [void]$arvore.Add(@{ path = "$($script:Destino)/$rel"; mode = '100644'; type = 'blob'; sha = $null })   # sha null = apagar
  }
  [void]$arvore.Add(@{
      path    = "$($script:Destino)/manifest.json"
      mode    = '100644'
      type    = 'blob'
      content = (Montar-Manifesto $manifesto $enviados $mudancas.remover)
    })

  $tree = GitHub 'POST' 'git/trees' @{ base_tree = $commitBase.tree.sha; tree = $arvore }

  $novos = @($mudancas.enviar | Where-Object { -not $manifesto.ContainsKey($_.rel) }).Count
  $alterados = $mudancas.enviar.Count - $novos
  $linhas = @()
  foreach ($f in $mudancas.enviar) { $linhas += "+ $($f.rel)" }
  foreach ($r in $mudancas.remover) { $linhas += "- $r" }
  $mensagem = "Baia ${Baia}: +$novos ~$alterados -$($mudancas.remover.Count) em $($script:Destino)/`n`n" + ($linhas -join "`n")

  $commit = GitHub 'POST' 'git/commits' @{ message = $mensagem; tree = $tree.sha; parents = @($headSha) }
  # Sem force: se outra baia publicou nesse meio-tempo, o GitHub recusa (422) e refazemos.
  [void](GitHub 'PATCH' ("git/refs/heads/" + (Caminho-Url $script:Branch)) @{ sha = $commit.sha; force = $false })
  return $commit.sha
}

function Checar-Seguranca($mudancas, $manifesto, [int]$nLocais) {
  $nRem = $mudancas.remover.Count
  if ($nRem -eq 0 -or $Forcar) { return }
  if ($nLocais -eq 0) {
    throw "a pasta está sem nenhum .pptx, mas o site tem $($manifesto.Count). OneDrive desconectado? Nada foi removido (use -Forcar se for intencional)."
  }
  $pct = [int](Valor $script:Cfg 'limite_remocao_pct' 50)
  if ($nRem -gt 1 -and ($nRem * 100 / [math]::Max($manifesto.Count, 1)) -gt $pct) {
    throw "removeria $nRem de $($manifesto.Count) arquivos (mais de $pct%). Nada foi publicado (use -Forcar se for intencional)."
  }
}

function Resumo($mudancas, $manifesto) {
  $partes = @()
  foreach ($f in $mudancas.enviar) { $partes += $(if ($manifesto.ContainsKey($f.rel)) { "~ $($f.rel)" } else { "+ $($f.rel)" }) }
  foreach ($r in $mudancas.remover) { $partes += "- $r" }
  return $partes
}

# ------------------------------------------------------------ principal ---

function Rodar {
  $script:Cfg = Ler-Json $Config
  if ($null -eq $script:Cfg) { throw "config não encontrado: $Config" }
  $script:Repo = Valor $script:Cfg 'repo' 'cot-ion/central-eventos'
  $script:Branch = Valor $script:Cfg 'branch' 'main'
  $script:Destino = ([string](Valor $script:Cfg 'destino' 'pptx')).Trim('/')
  $script:Token = Ler-Token $script:Cfg
  if (-not $script:Token -or $script:Token -like 'COLE_AQUI*') { throw 'token não configurado no config.json' }
  Configurar-Rede

  $estadoJson = Ler-Json $ArqEstado
  $cache = Novo-Dicionario
  if ($null -ne $estadoJson -and $null -ne $estadoJson.cache) {
    foreach ($p in $estadoJson.cache.PSObject.Properties) { $cache[$p.Name] = $p.Value }
  }

  if ($Diagnostico) {
    Resultado ($PSVersionTable.PSVersion.Major -ge 5) "PowerShell $($PSVersionTable.PSVersion)"
    try {
      $repoInfo = GitHub 'GET' ''
      Resultado $true "Conexão com api.github.com e token com acesso a $($repoInfo.full_name)"
    } catch { Resultado $false $_.Exception.Message; return 1 }
    $dataToken = Data-Token
    if ($dataToken) {
      $dias = [int]($dataToken - (Get-Date).ToUniversalTime()).TotalDays
      Resultado ($dias -ge 0) ("Token vence em {0:dd/MM/yyyy} ({1} dias)" -f $dataToken.ToLocalTime(), $dias)
    } else {
      Write-Host "[AVISO] Token sem data de validade informada pelo GitHub — prefira um token com validade." -ForegroundColor Yellow
    }
    try {
      [void](GitHub 'POST' 'git/blobs' @{ content = "teste de escrita da baia $Baia"; encoding = 'utf-8' })
      Resultado $true 'Permissão de escrita (Contents: Read and write)'
    } catch { Resultado $false "Permissão de escrita: $($_.Exception.Message)"; return 1 }
    try {
      [void](GitHub 'GET' ("git/ref/heads/" + (Caminho-Url $script:Branch)))
      Resultado $true "Branch $($script:Branch)"
    } catch { Resultado $false "Branch $($script:Branch): $($_.Exception.Message)"; return 1 }
  }

  try {
    $pasta = Achar-Pasta $script:Cfg $estadoJson
  } catch {
    if ($Diagnostico) { Resultado $false $_.Exception.Message; return 1 }
    throw
  }
  $locais = Listar-Pptx $pasta
  if ($Diagnostico) { Resultado $true "Pasta encontrada ($($locais.Count) .pptx): $pasta" }

  $tentativa = 0
  while ($true) {
    $tentativa++
    # 1ª leitura pelo nome do branch (rodada comum: 1 chamada só).
    $manifesto = Ler-Manifesto $script:Branch
    $mudancas = Comparar $locais $manifesto $cache
    Gravar-Estado $pasta $cache

    if ($mudancas.enviar.Count -eq 0 -and $mudancas.remover.Count -eq 0) {
      if ($tentativa -gt 1) { Log 'INFO' 'outra baia já publicou estas mudanças — nada a fazer' }
      else { Log 'INFO' "sem mudanças ($($locais.Count) arquivos em $($script:Destino)/)" }
      if ($Diagnostico) { Resultado $true "Teste (DryRun): pasta e site em dia" }
      return 0
    }
    Checar-Seguranca $mudancas $manifesto $locais.Count

    $lista = Resumo $mudancas $manifesto
    if ($DryRun) {
      Log 'INFO' ("publicaria em $($script:Destino)/: " + ($lista -join '; '))
      if ($Diagnostico) {
        Resultado $true ("Teste (DryRun): publicaria $($lista.Count) mudança(s) — a tarefa agendada publica sozinha")
        foreach ($l in $lista) { Write-Host "          $l" }
      }
      return 0
    }

    # Publicação: relê o manifesto no commit exato que será a base, para não
    # sobrescrever o que outra baia acabou de publicar.
    $head = (GitHub 'GET' ("git/ref/heads/" + (Caminho-Url $script:Branch))).object.sha
    $manifesto = Ler-Manifesto $head
    $mudancas = Comparar $locais $manifesto $cache
    if ($mudancas.enviar.Count -eq 0 -and $mudancas.remover.Count -eq 0) {
      Log 'INFO' 'outra baia já publicou estas mudanças — nada a fazer'
      return 0
    }
    Checar-Seguranca $mudancas $manifesto $locais.Count
    $lista = Resumo $mudancas $manifesto
    try {
      $sha = Publicar $mudancas $manifesto $head
      Log 'OK' ("publicado (commit $($sha.Substring(0, 7))): " + ($lista -join '; '))
      return 0
    } catch {
      $status = Status-Http $_
      if (($status -eq 409 -or $status -eq 422) -and $tentativa -lt 2) {
        Log 'INFO' "o branch mudou durante a publicação (HTTP $status) — comparando de novo"
        continue
      }
      throw
    }
  }
}

function Gravar-Estado([string]$pasta, $cache) {
  try {
    if (-not (Test-Path -LiteralPath $Base)) { New-Item -ItemType Directory -Path $Base -Force | Out-Null }
    $c = [ordered]@{}
    foreach ($k in ($cache.Keys | Sort-Object)) { $c[$k] = $cache[$k] }
    Gravar-Json $ArqEstado ([ordered]@{ pasta = $pasta; cache = $c })
  } catch { Log 'AVISO' "não foi possível gravar $ArqEstado ($($_.Exception.Message))" }
}

function Avisar-Token {
  $data = Data-Token
  if (-not $data) { return }
  $dias = [int]($data - (Get-Date).ToUniversalTime()).TotalDays
  $marca = Join-Path $Base 'aviso-token.txt'
  $hoje = Get-Date -Format 'yyyy-MM-dd'
  if ($dias -le 15 -and -not ((Test-Path -LiteralPath $marca) -and ([IO.File]::ReadAllText($marca).Trim() -eq $hoje))) {
    try { [IO.File]::WriteAllText($marca, $hoje) } catch { }
    Log 'AVISO' ("o token do GitHub vence em {0:dd/MM/yyyy} ({1} dias) — gere um novo e rode o instalar.bat nas baias" -f $data.ToLocalTime(), $dias)
  }
}

# Uma execução por vez nesta baia (a tarefa de 15 min e a de login podem coincidir).
$mutex = New-Object System.Threading.Mutex($false, 'Local\CentralEventosPublicar')
$codigo = 1
try {
  if (-not $mutex.WaitOne(0)) {
    Log 'INFO' 'outra execução já está em andamento — saindo'
    $codigo = 0
  } else {
    try {
      $codigo = [int](@(Rodar) | Select-Object -Last 1)   # só o código de saída, mesmo se algo "vazar" na saída
      Avisar-Token
    } catch {
      if ($Diagnostico) { Resultado $false $_.Exception.Message } else { Log 'ERRO' $_.Exception.Message }
      $codigo = 1
    } finally {
      $mutex.ReleaseMutex()
    }
  }
} finally {
  $mutex.Dispose()
  Girar-Log
}
exit $codigo
