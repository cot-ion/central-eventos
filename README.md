# Central de Eventos — Modelos COT

App web (PWA) para buscar os modelos de evento do *Infográfico Produções COT 2025*.
Funciona como site e pode ser instalado no celular via **Adicionar à tela inicial**
(abre em tela cheia e funciona offline após a primeira visita).

## Rodar localmente

Não há build. Basta servir a pasta:

```bash
npx serve .          # ou: python3 -m http.server 8080
```

## Estrutura

| Arquivo | O que é |
| --- | --- |
| `js/data.js` | **Os 19 modelos de evento** (uma entrada por página do PDF). Edite `nome` para renomear. |
| `js/search.js` | Busca (sem acento, por praça, estúdio, controle, sinal, meio/VIA, canais). |
| `js/app.js` | Home com busca + página de detalhe de cada modelo. |
| `css/styles.css` | Visual (tema claro/escuro automático, layout mobile). |
| `assets/originais/` | Imagem de cada página original do PDF ("Ver diagrama original"). |
| `sw.js`, `manifest.webmanifest` | PWA / instalação / offline. |

Ao alterar arquivos, incremente `VERSION` em `sw.js` para que os celulares
com o app instalado recebam a atualização.

## Publicar

O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push em `main`
(ative em *Settings → Pages → Source: GitHub Actions*).
