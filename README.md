# Central de Eventos — Modelos COT

App web (PWA) para buscar os modelos de evento do *Infográfico Produções COT 2025*.
Funciona como site e pode ser instalado no celular via **Adicionar à tela inicial**
(abre em tela cheia e funciona offline após a primeira visita).

## Rodar localmente

Não há build. Basta servir a pasta:

```bash
npx serve .          # ou: python3 -m http.server 8080
```

## Conteúdo: atualização automática

Os modelos vêm de **`data/eventos.json`**, gerado automaticamente a partir dos
.pptx de uma pasta do SharePoint. Uma máquina da equipe lê a pasta a cada
10 minutos e publica as mudanças aqui. O GitHub Pages republica o site sozinho.

➡️ **Instalação, manutenção e reconfiguração: [`automacao/README.md`](automacao/README.md)**

Não edite o `data/eventos.json` à mão: ele é sobrescrito na próxima sincronização.
Para mudar um nome ou apelido, use as notas do slide no PowerPoint (ver o guia).

## Estrutura

| Arquivo | O que é |
| --- | --- |
| `data/eventos.json` | Modelos de evento (gerado pela automação). |
| `automacao/` | Script de sincronização (Python), instalador da tarefa agendada e teste de conexão. |
| `js/data.js` | Carregamento do JSON, cores das praças e formato dos sinais. |
| `js/search.js` | Busca (sem acento, por praça, estúdio, controle, sinal, meio/VIA, canais, arquivo). |
| `js/app.js` | Home com busca, página de cada modelo e página de status (`#/status`). |
| `css/styles.css` | Visual (tema claro/escuro automático, layout mobile). |
| `assets/originais/` | Imagens das páginas do PDF original ("Ver diagrama original" dos modelos importados do PDF). |
| `sw.js`, `manifest.webmanifest` | PWA / instalação / offline. |

O `data/eventos.json` é sempre buscado na rede primeiro, então os celulares
recebem conteúdo novo sem nenhuma ação. Só quando o **código** do site
(HTML/CSS/JS) mudar é preciso incrementar `VERSION` em `sw.js`.

## Publicar

O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push em `main`
(ative em *Settings → Pages → Source: GitHub Actions*).
