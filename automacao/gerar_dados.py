"""
Gera o JSON do site a partir dos .pptx que as baias enviam para o repositório.

Roda no GitHub Actions (.github/workflows/site.yml) a cada push no main:

    python automacao/gerar_dados.py --pptx pptx --manual data/manual.json \
        --anterior anterior.json --saida _site/data/eventos.json

  --pptx      pasta do repositório com os .pptx (e o manifest.json das baias)
  --manual    modelos importados à mão (o PDF original), mantidos no site
  --anterior  JSON publicado antes: se um .pptx não puder ser lido, os modelos
              dele continuam como estavam (em vez de sumirem do site)
  --saida     arquivo gerado

Para ver como um arquivo está sendo lido:

    python automacao/gerar_dados.py --inspecionar arquivo.pptx
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))  # garante "import extrator" mesmo com python -I


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def ler_json(caminho: Path | None) -> dict:
    if not caminho or not caminho.exists():
        return {}
    try:
        with open(caminho, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        print(f"aviso: não foi possível ler {caminho}: {e}", file=sys.stderr)
        return {}


def listar_pptx(pasta: Path) -> list[Path]:
    if not pasta.is_dir():
        return []
    return sorted(
        (p for p in pasta.rglob("*.pptx") if not p.name.startswith(("~$", "."))),
        key=lambda p: p.relative_to(pasta).as_posix().lower(),
    )


def gerar(pasta: Path, manual: dict, anterior: dict) -> dict:
    from extrator import extrair  # importa aqui para --help funcionar sem python-pptx

    manifesto = ler_json(pasta / "manifest.json")
    enviados = manifesto.get("arquivos", {})
    eventos_anteriores: dict[str, list] = {}
    for ev in anterior.get("eventos", []):
        eventos_anteriores.setdefault(ev.get("fonte", {}).get("arquivo", ""), []).append(ev)

    arquivos: dict[str, dict] = {}
    por_arquivo: dict[str, list] = {}

    # 1. Modelos importados à mão (PDF original).
    for rel, info in manual.get("arquivos", {}).items():
        arquivos[rel] = info
    for ev in manual.get("eventos", []):
        por_arquivo.setdefault(ev["fonte"]["arquivo"], []).append(ev)

    # 2. Os .pptx enviados pelas baias.
    for caminho in listar_pptx(pasta):
        rel = caminho.relative_to(pasta).as_posix()
        info: dict = {"sha256": sha256(caminho)}
        envio = enviados.get(rel, {})
        for chave in ("modificado", "enviado_em", "enviado_por"):
            if envio.get(chave):
                info[chave] = envio[chave]
        try:
            r = extrair(caminho, rel)
        except Exception as e:  # arquivo corrompido, formato inesperado…
            info["erro"] = f"{type(e).__name__}: {e}"
            antigos = eventos_anteriores.get(rel, [])
            por_arquivo[rel] = antigos
            info["eventos"] = len(antigos)
            print(f"ERRO {rel}: {info['erro']} — mantidos {len(antigos)} modelo(s) da versão anterior")
            arquivos[rel] = info
            continue
        for ev in r["eventos"]:
            ev["fonte"]["sha256"] = info["sha256"]
        por_arquivo[rel] = r["eventos"]
        info.update(eventos=len(r["eventos"]), anotacoes=r["anotacoes"], avisos=r["avisos"], ignorados=r["ignorados"])
        arquivos[rel] = info
        print(f"ok   {rel}: {len(r['eventos'])} modelo(s)" + (f", {len(r['avisos'])} aviso(s)" if r["avisos"] else ""))
        for aviso in r["avisos"]:
            print(f"     aviso: {aviso}")

    # 3. Junta tudo, com IDs únicos (manuais primeiro, depois por nome de arquivo).
    eventos, ids, anotacoes = [], set(), []
    for rel in sorted(arquivos, key=lambda r: (not arquivos[r].get("manual"), r.lower())):
        anotacoes.extend(a for a in arquivos[rel].get("anotacoes", []) if a not in anotacoes)
        for ev in por_arquivo.get(rel, []):
            ev = copy.deepcopy(ev)
            base, n = ev["id"], 2
            while ev["id"] in ids:
                ev["id"] = f"{base}-{n}"
                n += 1
            if ev["id"] != base:
                print(f"     aviso: {rel}: ID '{base}' repetido — usando '{ev['id']}'")
            ids.add(ev["id"])
            eventos.append(ev)

    sincronizacao = {k: manifesto[k] for k in ("atualizado_em", "atualizado_por", "token_expira_em") if manifesto.get(k)}
    dados = {
        "versao": 1,
        "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "arquivos": arquivos,
        "anotacoes": anotacoes,
        "eventos": eventos,
    }
    if sincronizacao:
        dados["sincronizacao"] = sincronizacao
    return dados


def salvar(dados: dict, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pptx", type=Path, help="pasta com os .pptx enviados pelas baias")
    ap.add_argument("--manual", type=Path, help="JSON com os modelos importados à mão")
    ap.add_argument("--anterior", type=Path, help="JSON publicado anteriormente (opcional)")
    ap.add_argument("--saida", type=Path, help="JSON a gerar")
    ap.add_argument("--inspecionar", metavar="PPTX", type=Path, help="mostra as formas lidas de um .pptx")
    args = ap.parse_args()

    if args.inspecionar:
        from extrator import extrair, inspecionar

        saida = {"formas": inspecionar(args.inspecionar), "resultado": extrair(args.inspecionar, args.inspecionar.name)}
        destino = args.inspecionar.with_suffix(".inspecao.json")
        destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Inspeção salva em {destino}")
        return 0

    if not args.pptx or not args.saida:
        ap.error("--pptx e --saida são obrigatórios (ou use --inspecionar)")
    dados = gerar(args.pptx, ler_json(args.manual), ler_json(args.anterior))
    salvar(dados, args.saida)
    print(f"{len(dados['eventos'])} modelo(s) de {len(dados['arquivos'])} arquivo(s) → {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
