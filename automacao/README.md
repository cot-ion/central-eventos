# Conversão dos .pptx — Central de Eventos

As baias enviam os .pptx da pasta do SharePoint para `pptx/` no repositório
(ver [`baias/README.md`](../baias/README.md)). A cada push no `main`, o
workflow **Gerar e publicar o site** (`.github/workflows/site.yml`):

1. lê todos os .pptx de `pptx/` com o `extrator.py`;
2. junta com os modelos importados à mão do PDF (`data/manual.json`);
3. gera `data/eventos.json` e publica o site no GitHub Pages.

O mesmo é feito para `pptx-teste/` → `data/eventos-teste.json` (site com `?fonte=teste`).

| Arquivo | Para que serve |
| --- | --- |
| `extrator.py` | Lê o desenho de cada slide (blocos, sinais, setas, meio, canais…). |
| `gerar_dados.py` | Monta o JSON do site a partir de uma pasta de .pptx. |
| `testes/` | Testes automáticos, incluindo um .pptx real do infográfico. |

Proteções: se um .pptx não puder ser lido, os modelos dele continuam como
estavam na publicação anterior e o erro aparece na página **Status da
sincronização** do site. Os IDs repetidos ganham sufixo (`-2`, `-3`…).

**Tudo o que está nos .pptx enviados vira público** (o repositório e o site são
públicos), inclusive os nomes dos arquivos e das subpastas.

Para corrigir ou melhorar a leitura dos slides basta mudar o `extrator.py`:
o próximo push já usa a versão nova, sem mexer nas baias.

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

```bash
pip install -r automacao/requirements.txt
python automacao/gerar_dados.py --inspecionar "arquivo.pptx"
```

Isso gera `arquivo.inspecao.json` ao lado do .pptx, com todas as formas lidas
(posição, texto, cor, setas) e o resultado da interpretação. Esse arquivo é o
que um desenvolvedor precisa para ajustar o extrator. Ele não vai para o site.

---

## Para desenvolvedores

```bash
pip install -r automacao/requirements.txt
cd automacao && python -m unittest discover -s testes -v

# gerar o site localmente
python automacao/gerar_dados.py --pptx pptx --manual data/manual.json --saida data/eventos.json
npx serve .
```

- `testes/gerar_exemplo.py` gera um .pptx sintético no padrão do infográfico
  (grupos, setas, tachado, texto vermelho, notas de slide, `GRAVAR`).
- `testes/exemplos/` guarda .pptx reais. `testes/test_exemplo_real.py` confere
  que a extração bate com o modelo transcrito do PDF. **Ao criar um layout
  novo, copie um exemplo para essa pasta e acrescente um teste.**
- Os testes rodam no GitHub Actions (*Testes da automação*) a cada mudança em `automacao/`.
- Formato do JSON: veja o comentário no topo de `js/data.js`.
