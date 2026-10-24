# Sincronização automática — Central de Eventos

Este guia é para quem vai **instalar, manter ou reconfigurar** a atualização
automática do site. Não é preciso saber programar; siga os passos na ordem.

## Como funciona

```
 Equipe salva .pptx           OneDrive sincroniza          Máquina 10.3.31.249              GitHub
 na pasta do SharePoint  ──▶  a pasta na máquina     ──▶   a cada 10 min:              ──▶  Pages republica
                              ("Sempre manter neste         1. lê os .pptx alterados         o site (mesmo link)
                               dispositivo")                2. gera data/eventos.json
                                                            3. commit + push, se mudou
```

- A máquina **não serve nada**: ela só envia o `data/eventos.json` para o GitHub.
- Só os arquivos alterados são relidos (comparação por SHA-256).
- O site lê o `data/eventos.json`. Para ver o que foi lido e se houve
  problemas, abra a página **Status da sincronização** (link no rodapé do site,
  ou `<endereço do site>/#/status`).
- **Tudo o que está nos .pptx da pasta vira público** no site, inclusive os
  nomes dos arquivos e das subpastas.

### Proteções

| Situação | O que acontece |
| --- | --- |
| Pasta não encontrada (OneDrive desconectado, caminho errado) | Nada é publicado; erro no log. |
| A pasta aparece vazia, ou some mais de 50% dos modelos de uma vez | Nada é publicado; erro no log. Se foi intencional, rode com `--forcar`. |
| Um .pptx corrompido ou fora do padrão | Os modelos anteriores desse arquivo continuam no site; o erro aparece na página de status. Nas rodadas seguintes, o arquivo é lido de novo. |
| Arquivo salvo há menos de 2 minutos | Espera a próxima rodada (o OneDrive pode ainda estar baixando). |
| Arquivo aberto no PowerPoint (`~$arquivo.pptx`) | O arquivo de bloqueio é ignorado. |
| Rodada anterior ainda em andamento | A nova rodada não começa. |
| Push falhou (rede, token) | Erro no log; na próxima rodada tudo é refeito do zero a partir do GitHub. |

## Arquivos desta pasta

| Arquivo | Para que serve |
| --- | --- |
| `teste_conexao.ps1` | Verifica se a máquina alcança o GitHub e o PyPI, e se consegue clonar e dar push. **Rode primeiro.** |
| `instalar.ps1` | Cria o ambiente Python, o `config.ini` e a tarefa agendada (`-Remover` desfaz). |
| `sincronizar.py` | O script que a tarefa agendada executa. |
| `extrator.py` | Lê os slides e entende o diagrama. |
| `config.exemplo.ini` | Modelo do `config.ini`. |
| `config.ini` | Configuração desta máquina. **Não vai para o GitHub.** |
| `logs/sincronizar.log` | Histórico de execuções. Guarda 5 arquivos de 1 MB e apaga os mais antigos. |
| `testes/` | Testes automáticos, para quem for mexer no código. |

---

## Instalação (uma vez)

### Passo 1 — Criar o token do GitHub

O token é uma "senha" que só permite escrever **neste repositório** e que tem
**data de validade**.

1. Entre no GitHub com uma conta que tenha permissão de escrita no repositório
   `cot-ion/central-eventos`.
2. Abra **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. Preencha:
   - **Token name**: `central-eventos-sync-10.3.31.249`
   - **Resource owner**: `cot-ion`
   - **Expiration**: escolha uma data (sugestão: 1 ano) e **anote no calendário
     da equipe um lembrete uma semana antes de vencer**.
   - **Repository access**: *Only select repositories* → `cot-ion/central-eventos`
   - **Permissions → Repository permissions → Contents**: *Read and write*
     (o *Metadata: Read-only* é adicionado sozinho). Não marque mais nada.
4. **Generate token** e copie o valor (`github_pat_...`). Ele só aparece uma vez.
   Não cole o token em e-mail, chat ou arquivos.

> Se a organização `cot-ion` exigir aprovação para tokens fine-grained, um
> administrador da organização precisa aprovar o token antes que ele funcione.
>
> O token pertence à pessoa que o criou. Se essa pessoa sair da organização,
> o token para de funcionar. Nesse caso, siga [Trocar o token](#trocar-o-token).

### Passo 2 — Preparar a máquina 10.3.31.249

Entre na máquina **com o usuário que tem o OneDrive conectado à pasta do SharePoint**.

1. **Pasta do SharePoint**: no Explorer, clique com o botão direito na pasta →
   **Sempre manter neste dispositivo**.
2. **Git**: instale o [Git for Windows](https://git-scm.com/download/win). Sem
   permissão de administrador, use o *PortableGit* da mesma página e coloque a
   pasta `bin` dele no PATH do usuário.
3. **Python 3.10 ou mais novo**: instale pelo [python.org](https://www.python.org/downloads/windows/).
   O instalador "para este usuário" não exige administrador. Marque **Add python.exe to PATH**.
   (O "python" da Microsoft Store não serve para a tarefa agendada.)

### Passo 3 — Testar a conexão com o GitHub

Antes de instalar qualquer coisa, confirme que a rede da empresa permite o acesso.

1. Baixe o arquivo `automacao/teste_conexao.ps1` pelo GitHub (botão *Download raw file*).
2. Abra o PowerShell na pasta onde ele foi salvo e rode:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\teste_conexao.ps1
   ```
3. Quando abrir a janela de login do GitHub, escolha **Token** (ou *Personal
   access token*) e cole o token do passo 1. Se pedir usuário e senha, use o
   seu usuário do GitHub e cole o token no campo de senha. O Windows guarda o
   token no **Gerenciador de Credenciais**; ele não fica em nenhum arquivo.
4. Todas as linhas devem terminar em ` OK `. O teste de escrita cria e apaga um
   branch temporário `teste-conexao-...`; o site não é alterado.

Se algo falhar, o próprio script sugere a correção. Veja também
[Proxy e certificados](#proxy-e-certificados). Se `github.com` estiver
bloqueado pela rede, não há como contornar: é preciso pedir a liberação de
`github.com` na porta 443.

### Passo 4 — Clonar o repositório

```powershell
mkdir C:\CentralEventos
git clone https://github.com/cot-ion/central-eventos.git C:\CentralEventos\central-eventos
```

> ⚠️ Esta pasta é **exclusiva do robô**. A cada rodada ela é igualada ao GitHub
> (`git reset --hard`), então qualquer edição manual feita nela é perdida.
> Para mexer no site, use outro clone ou edite pelo GitHub.

### Passo 5 — Instalar a tarefa agendada

```powershell
cd C:\CentralEventos\central-eventos\automacao
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

1. Na primeira vez o instalador cria o `config.ini` e o abre no Bloco de Notas.
   Em `pptx =`, coloque o caminho da pasta do SharePoint (no Explorer: botão
   direito na pasta → **Copiar como caminho**, e cole sem as aspas). Salve.
2. Rode o `instalar.ps1` de novo. Ele faz uma **simulação** (lê a pasta sem
   publicar nada) e, se tudo der certo, agenda a tarefa
   **"Central de Eventos - Sincronizar"** para rodar a cada 10 minutos.
   Para outro intervalo, use `-Intervalo 15`.
3. Para publicar agora, sem esperar a próxima rodada:
   ```powershell
   Start-ScheduledTask -TaskName "Central de Eventos - Sincronizar"
   ```
   Depois veja o `logs\sincronizar.log` e a página de status do site.

### Passo 6 — GitHub Pages (uma vez, no GitHub)

No repositório: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. A cada push no `main`, o workflow *Publicar no GitHub Pages*
republica o site em cerca de 1 minuto. O link do site não muda.

> GitHub Pages em repositório **privado** exige plano pago da organização.
> Como o conteúdo pode ser público, o mais simples é deixar o repositório público.

---

## Como montar os .pptx

O extrator lê o **desenho** do slide no mesmo padrão do infográfico. Para que
um slide vire um modelo de evento no site:

| Elemento | Como desenhar |
| --- | --- |
| Título | Texto no topo do slide (ou o espaço reservado de título): `ION x SP`. A praça é o que vem depois do "x". |
| Modelo | Caixa de texto com `Estúdio: 6 SP` e `Controle: ION` (e `Modelo: TVG`, se houver). |
| Seções | Rótulos **`VIDEO`** e **`AUDIO`**: o que está acima de `AUDIO` é vídeo, o que está abaixo é áudio. Slide sem esses rótulos é ignorado (capa, logo). |
| Blocos | Caixas **altas** com o nome: `COT SP`, `CTL ION`, `EXIBE`… São lidos da esquerda para a direita. |
| Sinais | Caixas **pequenas com preenchimento** (`CAMERA 1`, `MINUS`). Caixa preenchida sem texto = posição reservada. |
| Sentido | Uma **seta com ponta** na mesma altura do sinal. Ponta para a direita = ida; para a esquerda = retorno. |
| Meio (via) | Texto sem preenchimento logo **acima da seta** (`PR RX SP-1`, `METROLAN`). |
| Gravação | Texto `GRAVAR` logo abaixo do sinal (ex.: `PGM LIMPO`). |
| Canais | Caixa de texto com o título na primeira linha e linhas `CH 1 – LAPELA NARRA`. |
| Destaque | Texto em **vermelho** aparece no site como "a confirmar". Texto **tachado** aparece riscado. |
| Notas de rodapé | Texto começando com `*`. `Station: ...` e `EM CONSTRUÇÃO` também são reconhecidos. |
| Anotações | Slide cujo título começa com "Anotações": cada linha vira uma anotação na home do site. |

Agrupar formas não atrapalha. O que importa é a posição de cada forma no slide.

### Ajustes pelas notas do slide

No PowerPoint, o campo de **anotações do slide** (embaixo do slide) aceita,
uma informação por linha:

```
Nome: SP · Estúdio 6 SP com controle ION
Apelidos: câmeras sp, narração sp
Praça: SP
ID: ion-sp-6sp
Ocultar: sim
```

- **Nome**: o nome que aparece no site. Sem ele, o nome é montado a partir de
  praça, estúdio e controle.
- **Apelidos**: palavras extras para a busca encontrar o modelo.
- **ID**: fixa o endereço da página do modelo. Sem ele, o endereço usa o nome do
  arquivo e um número interno do slide. Por isso, **renomear o .pptx muda os
  links** dos modelos daquele arquivo, a menos que eles tenham `ID:`.
- **Ocultar: sim**: o slide não vai para o site.

### Conferir como um arquivo está sendo lido

```powershell
cd C:\CentralEventos\central-eventos\automacao
.venv\Scripts\python sincronizar.py --inspecionar "C:\caminho\arquivo.pptx"
```

Isso gera `arquivo.inspecao.json` ao lado do .pptx, com todas as formas lidas
(posição, texto, cor, setas) e o resultado da interpretação. Esse arquivo é o
que um desenvolvedor precisa para ajustar o extrator. Ele não vai para o site.

---

## Manutenção e reconfiguração

### Ver se está funcionando

- Página **Status da sincronização** no site: data da última publicação, arquivos
  lidos, avisos e erros de cada arquivo.
- `C:\CentralEventos\central-eventos\automacao\logs\sincronizar.log`
- Agendador de Tarefas → *Central de Eventos - Sincronizar* → **Último Resultado**:
  `0x0` = ok, `0x1` = erro (detalhe no log), `0x2` = erro no `config.ini`.

"Atualizado em" só muda quando algum conteúdo muda. Se você salvou um .pptx há
mais de 15 minutos e o site não mudou, veja o log.

### Rodar manualmente

```powershell
cd C:\CentralEventos\central-eventos\automacao
.venv\Scripts\python sincronizar.py              # rodada normal
.venv\Scripts\python sincronizar.py --simular    # só mostra o que mudaria (resultado em logs\eventos.simulado.json)
.venv\Scripts\python sincronizar.py --reprocessar  # relê todos os .pptx (ex.: depois de atualizar o extrator)
.venv\Scripts\python sincronizar.py --forcar     # publica mesmo com a trava de segurança (remoção em massa intencional)
```

### Mudar a pasta do SharePoint

Edite `pptx =` no `config.ini`. Não precisa reinstalar. Os modelos da pasta
antiga saem do site na próxima rodada (se forem mais de 50%, use `--forcar`).

### Mudar o intervalo

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Intervalo 15
```

### Pausar e retomar

```powershell
Disable-ScheduledTask -TaskName "Central de Eventos - Sincronizar"
Enable-ScheduledTask  -TaskName "Central de Eventos - Sincronizar"
```

### Trocar o token

Faça isso quando o token expirar, quando a pessoa dona dele sair, ou quando o log
mostrar `token pode ter expirado`.

1. Crie um token novo ([Passo 1](#passo-1--criar-o-token-do-github)). Apague o
   antigo no GitHub.
2. Na máquina: **Painel de Controle → Gerenciador de Credenciais → Credenciais do
   Windows** → `git:https://github.com` → **Remover**.
3. Rode `teste_conexao.ps1` e cole o token novo quando pedir.

### Trocar de máquina

1. Na máquina antiga: `.\instalar.ps1 -Remover`, depois remova a credencial
   `git:https://github.com` como no item acima.
2. Na máquina nova: repita os passos 2 a 5. Gere um token novo com o nome da
   máquina nova.

Nunca deixe duas máquinas sincronizando ao mesmo tempo.

### Tirar do site o conteúdo importado do PDF

Os 19 modelos iniciais vieram do PDF do infográfico e estão marcados como
"importação manual". Quando os .pptx da pasta cobrirem todos eles, coloque
`manter_eventos_manuais = nao` no `config.ini` e rode
`sincronizar.py --forcar` uma vez.

### Atualizações do código

A cada rodada o clone é igualado ao `main` do GitHub. Por isso, mudanças em
`sincronizar.py` e `extrator.py` feitas no GitHub passam a valer **a partir da
rodada seguinte**, sem mexer na máquina. Se as dependências mudarem
(`requirements.txt`), rode o `instalar.ps1` de novo.

> Consequência de segurança: quem pode fazer push no `main` consegue mudar o
> código que roda nesta máquina. Restrinja a escrita no repositório às pessoas
> da equipe (e, se possível, ative *branch protection* exigindo revisão nos
> pull requests, liberando o push direto só para a conta do robô).

### Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Remover
```

Depois remova a credencial `git:https://github.com` e apague `C:\CentralEventos`.

---

## Proxy e certificados

| Sintoma no log ou no teste | Correção |
| --- | --- |
| `SSL certificate problem` / `unable to get local issuer certificate` | `git config --global http.sslBackend schannel` (o Git passa a usar os certificados do Windows, que incluem os da empresa). |
| `Could not resolve host` / `Failed to connect` / `timed out` | A rede exige proxy: `git config --global http.proxy http://ENDERECO:PORTA` (o endereço aparece no início do `teste_conexao.ps1`). |
| `pip` não consegue baixar | `$env:HTTPS_PROXY = "http://ENDERECO:PORTA"` antes de rodar o `instalar.ps1`. |
| `401` / `403` / `Authentication failed` | Token expirado, sem a permissão *Contents: Read and write*, ou não aprovado pela organização. Veja [Trocar o token](#trocar-o-token). |
| `pasta ... não encontrada` | O OneDrive está conectado? O caminho no `config.ini` está certo? |
| `outra execução em andamento` por muito tempo | Se a máquina foi desligada no meio de uma rodada, apague `automacao\.sincronizar.lock` (a trava também se libera sozinha após 30 minutos). |

A tarefa roda **somente com o usuário logado**. É por causa disso que o OneDrive
e o token salvo no Windows funcionam. Se a máquina ficar sem ninguém logado
(ex.: depois de reiniciar), a sincronização para até alguém entrar de novo.
Bloquear a tela não interrompe a sincronização.

---

## Para desenvolvedores

```bash
cd automacao
pip install -r requirements.txt
python -m unittest discover -s testes -v
```

- `testes/gerar_exemplo.py` gera um .pptx sintético no padrão do infográfico. Ele
  inclui grupos, setas, tachado, texto vermelho, notas de slide e `GRAVAR`.
- `testes/test_sincronizar.py` simula o GitHub com um repositório git local e
  cobre: publicação, "sem mudanças", trava de segurança, arquivo corrompido e simulação.
- Os testes rodam no GitHub Actions (*Testes da automação*) a cada mudança em `automacao/`.
- Formato do JSON: veja o comentário no topo de `js/data.js`.
