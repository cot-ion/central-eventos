# Publicação automática pelas baias

Cada baia da equipe confere a pasta do SharePoint (sincronizada pelo OneDrive)
a cada 15 minutos. Quando um .pptx muda, a baia envia esse arquivo para o
GitHub e o site se atualiza sozinho em ~2 minutos. Basta **uma** baia ligada.
Não precisa de administrador, Python nem git: só o PowerShell do Windows.

```
OneDrive (pasta da equipe) ──▶ baia: publicar.ps1 ──▶ GitHub: pptx/ ──▶ Actions converte ──▶ site
          a cada 15 min, compara com pptx/manifest.json (o mesmo para todas as baias)
```

## 1. Gerar o token (uma vez, para todas as baias)

**Entre no GitHub com a conta `cot-ion`** (a dona do repositório — um token
criado por outra conta não consegue escrever nele, mesmo que essa conta seja
colaboradora). Depois: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**

| Campo | Valor |
| --- | --- |
| Token name | `central-eventos-baias` |
| Resource owner | `cot-ion` |
| **Expiration** | escolha uma data (ex.: 1 ano) e **marque no calendário da equipe** um lembrete 2 semanas antes |
| Repository access | *Only select repositories* → `cot-ion/central-eventos` |
| Permissions → Repository → **Contents** | **Read and write** (nada mais) |

Copie o token (`github_pat_...`). Ele só aparece uma vez.

## 2. Preparar o pendrive / pasta de instalação

1. Copie a pasta `baias/` do repositório.
2. Copie `config.example.json` para **`config.json`** (na mesma pasta) e edite:
   - `"token"`: cole o token;
   - `"pasta"`: nome da pasta do SharePoint — já vem `Central de Eventos`
     (em cada baia ela é achada em `C:\Users\<usuário>\Globo Comunicação e Participações sa\COT ION - ...\Central de Eventos`);
   - `"destino"`: `pptx-teste` para testes, depois `pptx` (o site de verdade).

O `config.json` tem o token em texto puro: não mande por e-mail ou chat, e não
coloque no repositório (o `.gitignore` já impede).

| Campo | Para que serve |
| --- | --- |
| `pasta` | Nome da pasta, procurada dentro de `C:\Users\<usuário>` (até `profundidade_busca` níveis). |
| `caminho_contem` | Se houver duas pastas com o mesmo nome, um trecho do caminho certo (ex.: `COT ION`). |
| `destino` | Pasta do repositório onde os .pptx ficam: `pptx` (site) ou `pptx-teste`. |
| `intervalo_minutos` | De quanto em quanto tempo a baia confere a pasta. |
| `espelhar_remocoes` | `true`: arquivo apagado da pasta sai do site também. |
| `limite_remocao_pct` | Não remove se sumir mais que isso de uma vez (OneDrive desconectado?). |
| `tamanho_maximo_mb` | Arquivos maiores são ignorados (o GitHub recusa acima de 100 MB). |

## 3. Instalar numa baia

Logado com o usuário da baia (o que tem o OneDrive), dê dois cliques em
**`instalar.bat`**. No fim aparece uma lista `[OK]` / `[FALHA]` e um teste
sem publicar, mostrando o que a baia enviaria. Pronto: a partir daí a baia
publica sozinha a cada 15 minutos e ao fazer login.

Para publicar na hora, sem esperar: `schtasks /Run /TN CentralEventos`

## 4. Verificar

- **Log da baia**: `%LOCALAPPDATA%\CentralEventos\log.txt` (cole no Explorer).
  Guarda as últimas ~500 linhas.
- **Site**: rodapé → *Status da sincronização* mostra qual baia enviou cada
  arquivo e quando, e avisa quando o token está perto de vencer.
- **Teste sem publicar**, a qualquer momento:
  ```
  powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\CentralEventos\publicar.ps1" -DryRun
  ```
- **GitHub → Actions → "Gerar e publicar o site"**: conversão de cada envio.

## 5. Desinstalar

Dois cliques em **`desinstalar.bat`**: remove as tarefas, o atalho (se houver)
e a pasta `%LOCALAPPDATA%\CentralEventos`.

## Renovar o token (quando estiver perto de vencer)

1. Gere um token novo (passo 1) e apague o antigo no GitHub.
2. Troque o `"token"` no `config.json` do pendrive.
3. Rode o **`instalar.bat`** de novo em cada baia. Ele só atualiza o token e
   as tarefas; nada mais muda.

Se o token vencer antes, nada quebra no site: as baias só param de publicar
(o log mostra `HTTP 401`) até receberem o token novo.

## Sequência de testes recomendada

1. `config.json` com `"destino": "pptx-teste"` (o padrão) → `instalar.bat`.
   Confira o teste sem publicar no fim da instalação.
2. `schtasks /Run /TN CentralEventos` → em ~2 min, abra o site com
   **`?fonte=teste`** no fim do endereço (faixa amarela "TESTE").
   O site normal não muda.
3. Tudo certo: troque para `"destino": "pptx"` e rode o
   `instalar.bat` nas 11 baias.

## Problemas comuns

| No log | O que fazer |
| --- | --- |
| `pasta '...' não encontrada` | O OneDrive desta baia sincroniza a biblioteca? O nome em `pasta` está igual? |
| `mais de uma pasta '...' encontrada` | Preencha `caminho_contem` com um trecho do caminho certo. |
| `HTTP 401` | Token vencido ou errado → renove. |
| `HTTP 403` | O token não pode escrever no repositório. Ele precisa ser criado **logado na conta `cot-ion`** (dona do repositório), com *Only select repositories → central-eventos* e *Contents: Read and write*. Permissões podem ser editadas no token existente; o dono, não. |
| `sem conexão com api.github.com` | Rede ou proxy. A baia tenta de novo na próxima rodada. |
| `removeria N de M arquivos` | Proteção: sumiu muita coisa de uma vez. Se foi de propósito, rode o `publicar.ps1 -Forcar` uma vez. |
| `salvo há menos de 2 min` | Normal: espera o OneDrive terminar de gravar. |

**Duas baias ao mesmo tempo** não é problema: se outra baia publicar no meio
do caminho, a baia compara de novo e, se já estiver em dia, só encerra.
