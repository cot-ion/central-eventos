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

```
Pasta do SharePoint ──OneDrive──▶ baias (publicar.ps1, a cada 15 min) ──▶ pptx/ no GitHub
        ──▶ GitHub Actions converte (automacao/) ──▶ data/eventos.json ──▶ site
```

- **Instalar / manter as baias:** [`baias/README.md`](baias/README.md)
- **Como os .pptx são lidos e como montar os slides:** [`automacao/README.md`](automacao/README.md)

O `data/eventos.json` não fica no repositório: é gerado a cada publicação.
Os modelos transcritos à mão do PDF original estão em `data/manual.json`.

## Estrutura

| Arquivo | O que é |
| --- | --- |
| `pptx/`, `pptx-teste/` | .pptx enviados pelas baias + `manifest.json` (não edite à mão). |
| `baias/` | Scripts das baias (PowerShell, sem admin) e instalador. |
| `automacao/` | Conversão dos .pptx (Python, roda no GitHub Actions) e testes. |
| `data/manual.json` | Modelos importados do PDF do infográfico. |
| `js/`, `css/`, `index.html` | O site (busca, página de cada modelo, `#/status`). |
| `assets/originais/` | Imagens das páginas do PDF ("Ver diagrama original"). |
| `sw.js`, `manifest.webmanifest` | PWA / instalação / offline. |

O JSON é sempre buscado na rede primeiro, então os celulares recebem conteúdo
novo sem nenhuma ação. Só quando o **código** do site mudar é preciso
incrementar `VERSION` em `sw.js`.

## Publicar

O workflow `.github/workflows/site.yml` gera os dados e publica no GitHub Pages
a cada push no `main` (*Settings → Pages → Source: GitHub Actions*).
