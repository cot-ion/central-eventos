"""
Sincroniza os .pptx da pasta do SharePoint (via OneDrive) com o site.

Roda a cada 10–15 min pelo Agendador de Tarefas do Windows:

  1. atualiza este clone com o GitHub (git fetch + reset para origin/main);
  2. calcula o SHA-256 de cada .pptx da pasta e reprocessa só o que mudou;
  3. regenera data/eventos.json;
  4. se o conteúdo mudou, faz commit e push — o GitHub Pages republica.

Uso:
    python sincronizar.py                 # execução normal (a tarefa agendada usa esta)
    python sincronizar.py --simular       # mostra o que mudaria, sem commit/push
    python sincronizar.py --reprocessar   # ignora os hashes e relê todos os .pptx
    python sincronizar.py --forcar        # publica mesmo se as travas de segurança barrarem
    python sincronizar.py --inspecionar arquivo.pptx   # despeja as formas lidas do arquivo

Configuração em config.ini (copie de config.exemplo.ini). Instruções em README.md.
"""

from __future__ import annotations

import argparse
import configparser
import copy
import datetime as dt
import hashlib
import json
import logging
import logging.handlers
import os
import subprocess
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))  # garante "import extrator" mesmo com python -I
REPO = AQUI.parent
ARQ_DADOS = Path("data") / "eventos.json"
TRAVA = AQUI / ".sincronizar.lock"
TRAVA_VENCIDA_S = 30 * 60

log = logging.getLogger("sincronizar")


class ErroConfig(Exception):
    pass


class ErroSincronizacao(Exception):
    pass


# --------------------------------------------------------------------------
# Configuração e log
# --------------------------------------------------------------------------


def carregar_config(caminho: Path) -> dict:
    if not caminho.exists():
        raise ErroConfig(f"{caminho} não existe — copie config.exemplo.ini para config.ini e preencha.")
    cp = configparser.ConfigParser(interpolation=None)
    cp.read(caminho, encoding="utf-8")
    try:
        pasta = Path(os.path.expandvars(cp.get("pastas", "pptx"))).expanduser()
    except (configparser.NoSectionError, configparser.NoOptionError) as e:
        raise ErroConfig(f"config.ini: {e}") from None
    return {
        "pasta_pptx": pasta,
        "branch": cp.get("git", "branch", fallback="main"),
        "remoto": cp.get("git", "remoto", fallback="origin"),
        "autor_nome": cp.get("git", "autor_nome", fallback="Robô Central de Eventos"),
        "autor_email": cp.get("git", "autor_email", fallback="central-eventos@users.noreply.github.com"),
        "estabilidade_s": cp.getint("seguranca", "estabilidade_segundos", fallback=120),
        "queda_maxima_pct": cp.getint("seguranca", "queda_maxima_pct", fallback=50),
        "manter_manuais": cp.getboolean("conteudo", "manter_eventos_manuais", fallback=True),
    }


def configurar_log(verbose: bool) -> None:
    (AQUI / "logs").mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    arquivo = logging.handlers.RotatingFileHandler(
        AQUI / "logs" / "sincronizar.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    arquivo.setFormatter(fmt)
    log.addHandler(arquivo)
    if sys.stdout is not None:  # pythonw.exe não tem console
        tela = logging.StreamHandler(sys.stdout)
        tela.setFormatter(fmt)
        log.addHandler(tela)
    log.setLevel(logging.DEBUG if verbose else logging.INFO)


class Trava:
    """Impede duas execuções simultâneas (ex.: uma rodada demorou mais que o intervalo)."""

    def __enter__(self):
        if TRAVA.exists() and time.time() - TRAVA.stat().st_mtime < TRAVA_VENCIDA_S:
            raise ErroSincronizacao(f"outra execução em andamento ({TRAVA.name} existe)")
        TRAVA.write_text(f"{os.getpid()} {dt.datetime.now().isoformat()}", encoding="utf-8")
        return self

    def __exit__(self, *exc):
        TRAVA.unlink(missing_ok=True)


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------


def git(*args: str, timeout: int = 120) -> str:
    env = dict(os.environ)
    # Numa tarefa agendada ninguém pode digitar senha: falhar em vez de travar.
    env.update(GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never")
    r = subprocess.run(
        ["git", "-C", str(REPO), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env=env,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if r.returncode != 0:
        saida = (r.stderr or r.stdout).strip()
        dica = ""
        if any(s in saida for s in ("401", "403", "Authentication failed", "could not read Username")):
            dica = " — o token pode ter expirado ou estar sem permissão (ver README: 'Trocar o token')."
        elif any(s in saida.lower() for s in ("ssl", "certificate")):
            dica = " — problema de certificado/proxy (ver README: 'Proxy e certificados')."
        elif any(s in saida.lower() for s in ("could not resolve", "timed out", "unable to access", "proxy")):
            dica = " — sem acesso ao GitHub (rede/proxy)."
        raise ErroSincronizacao(f"git {' '.join(args)} falhou: {saida}{dica}")
    return r.stdout.strip()


def atualizar_clone(cfg: dict) -> None:
    """Deixa o clone idêntico ao GitHub. Este clone é exclusivo do robô."""
    git("fetch", "--quiet", cfg["remoto"], cfg["branch"])
    git("checkout", "--quiet", "-B", cfg["branch"], f"{cfg['remoto']}/{cfg['branch']}")
    git("reset", "--quiet", "--hard", f"{cfg['remoto']}/{cfg['branch']}")


def publicar(cfg: dict, mensagem: str) -> None:
    git("add", ARQ_DADOS.as_posix())
    git(
        "-c", f"user.name={cfg['autor_nome']}",
        "-c", f"user.email={cfg['autor_email']}",
        "commit", "--quiet", "-m", mensagem,
    )
    git("push", "--quiet", cfg["remoto"], f"HEAD:{cfg['branch']}", timeout=180)


# --------------------------------------------------------------------------
# Leitura da pasta e montagem do JSON
# --------------------------------------------------------------------------


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def listar_pptx(pasta: Path) -> list[Path]:
    if not pasta.is_dir():
        raise ErroSincronizacao(
            f"pasta {pasta} não encontrada — o OneDrive está conectado e sincronizando? "
            "(nada foi publicado)"
        )
    arquivos = []
    for p in pasta.rglob("*.pptx"):
        # ~$arquivo.pptx = arquivo de bloqueio do PowerPoint aberto
        if p.name.startswith(("~$", ".")) or any(parte.startswith(".") for parte in p.relative_to(pasta).parts):
            continue
        arquivos.append(p)
    return sorted(arquivos, key=lambda p: p.relative_to(pasta).as_posix().lower())


def carregar_dados_atuais() -> dict:
    caminho = REPO / ARQ_DADOS
    if not caminho.exists():
        return {"versao": 1, "arquivos": {}, "anotacoes": [], "eventos": []}
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)
    dados.setdefault("arquivos", {})
    return dados


def montar(cfg: dict, atual: dict, reprocessar: bool) -> tuple[dict, list[str]]:
    """Gera o novo conteúdo do JSON. Devolve (dados, lista de arquivos alterados)."""
    from extrator import extrair  # importa aqui para --help funcionar sem python-pptx

    pasta = cfg["pasta_pptx"]
    eventos_por_arquivo: dict[str, list] = {}
    for ev in atual.get("eventos", []):
        eventos_por_arquivo.setdefault(ev.get("fonte", {}).get("arquivo", ""), []).append(ev)

    arquivos: dict[str, dict] = {}
    alterados: list[str] = []
    agora = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    # Conteúdo importado manualmente (ex.: o PDF original) — mantido se configurado.
    if cfg["manter_manuais"]:
        for rel, info in atual["arquivos"].items():
            if info.get("manual"):
                arquivos[rel] = info

    for caminho in listar_pptx(pasta):
        rel = caminho.relative_to(pasta).as_posix()
        anterior = atual["arquivos"].get(rel)
        idade = time.time() - caminho.stat().st_mtime
        if idade < cfg["estabilidade_s"]:
            log.info("%s alterado há %ds — aguardando o OneDrive terminar de gravar", rel, idade)
            if anterior:
                arquivos[rel] = anterior
            continue
        try:
            hash_atual = sha256(caminho)
        except OSError as e:
            log.warning("%s: não foi possível ler (%s) — mantendo versão anterior", rel, e)
            if anterior:
                arquivos[rel] = anterior
            continue
        if anterior and anterior.get("sha256") == hash_atual and not anterior.get("erro") and not reprocessar:
            arquivos[rel] = anterior
            continue

        log.info("processando %s", rel)
        try:
            r = extrair(caminho, rel)
        except Exception as e:  # arquivo corrompido, formato inesperado…
            log.error("%s: falha na extração (%s: %s) — mantendo versão anterior", rel, type(e).__name__, e)
            info = dict(anterior or {})
            info["erro"] = f"{type(e).__name__}: {e}"
            arquivos[rel] = info  # sem atualizar o sha256: tenta de novo na próxima rodada
            continue
        for aviso in r["avisos"]:
            log.warning(aviso)
        for ign in r["ignorados"]:
            log.info("%s %s — ignorado", rel, ign)
        for ev in r["eventos"]:
            ev["fonte"]["sha256"] = hash_atual
        eventos_por_arquivo[rel] = r["eventos"]
        arquivos[rel] = {
            "sha256": hash_atual,
            "processado_em": agora,
            "eventos": len(r["eventos"]),
            "anotacoes": r["anotacoes"],
            "avisos": r["avisos"],
            "ignorados": r["ignorados"],
        }
        alterados.append(rel)

    removidos = sorted(set(atual["arquivos"]) - set(arquivos))
    for rel in removidos:
        log.info("%s saiu da pasta — removendo seus eventos", rel)

    eventos, ids = [], set()
    anotacoes: list[str] = []
    for rel in sorted(arquivos, key=lambda r: (not arquivos[r].get("manual"), r.lower())):
        anotacoes.extend(a for a in arquivos[rel].get("anotacoes", []) if a not in anotacoes)
        for ev in eventos_por_arquivo.get(rel, []):
            ev = copy.deepcopy(ev)
            base, n = ev["id"], 2
            while ev["id"] in ids:
                ev["id"] = f"{base}-{n}"
                n += 1
            if ev["id"] != base:
                log.warning("%s: ID '%s' repetido — usando '%s'", rel, base, ev["id"])
            ids.add(ev["id"])
            eventos.append(ev)

    novo = {
        "versao": 1,
        "gerado_em": atual.get("gerado_em"),
        "arquivos": arquivos,
        "anotacoes": anotacoes,
        "eventos": eventos,
    }
    return novo, alterados + [f"(removido) {r}" for r in removidos]


def sem_carimbos(dados: dict) -> dict:
    d = copy.deepcopy(dados)
    d.pop("gerado_em", None)
    for info in d.get("arquivos", {}).values():
        info.pop("processado_em", None)
    return d


def checar_seguranca(atual: dict, novo: dict, cfg: dict) -> None:
    antes, depois = len(atual.get("eventos", [])), len(novo["eventos"])
    if antes and not depois:
        raise ErroSincronizacao(
            f"o novo conteúdo ficaria sem nenhum evento (antes: {antes}). "
            "Pasta vazia ou OneDrive desconectado? Nada foi publicado. Use --forcar se for intencional."
        )
    if antes and (antes - depois) * 100 / antes > cfg["queda_maxima_pct"]:
        raise ErroSincronizacao(
            f"o número de eventos cairia de {antes} para {depois} (mais de {cfg['queda_maxima_pct']}%). "
            "Nada foi publicado. Confira a pasta e rode com --forcar se for intencional."
        )


def salvar(dados: dict, destino: Path) -> None:
    tmp = destino.with_suffix(".json.tmp")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, destino)


def resumo_mudancas(atual: dict, novo: dict) -> str:
    antes = {e["id"]: e for e in atual.get("eventos", [])}
    depois = {e["id"]: e for e in novo["eventos"]}
    add = len(depois.keys() - antes.keys())
    rem = len(antes.keys() - depois.keys())
    mud = sum(1 for k in depois.keys() & antes.keys() if depois[k] != antes[k])
    return f"+{add} novos, ~{mud} alterados, -{rem} removidos (total {len(depois)})"


# --------------------------------------------------------------------------


def executar(args) -> int:
    cfg = carregar_config(Path(args.config))
    with Trava():
        if not args.simular:
            atualizar_clone(cfg)
        atual = carregar_dados_atuais()
        novo, alterados = montar(cfg, atual, args.reprocessar)

        if sem_carimbos(novo) == sem_carimbos(atual):
            log.info("sem mudanças (%d eventos)", len(novo["eventos"]))
            return 0

        resumo = resumo_mudancas(atual, novo)
        log.info("mudanças: %s", resumo)
        if not args.forcar:
            checar_seguranca(atual, novo, cfg)

        novo["gerado_em"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        if args.simular:
            destino = AQUI / "logs" / "eventos.simulado.json"
            salvar(novo, destino)
            log.info("simulação: resultado salvo em %s (nada foi publicado)", destino)
            return 0

        salvar(novo, REPO / ARQ_DADOS)
        lista = "\n".join(f"- {a}" for a in alterados) or "- (metadados)"
        publicar(cfg, f"Atualiza modelos de evento: {resumo}\n\n{lista}")
        log.info("publicado no GitHub — o site atualiza em ~1 minuto")
        return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=str(AQUI / "config.ini"))
    ap.add_argument("--simular", action="store_true", help="não faz commit/push")
    ap.add_argument("--reprocessar", action="store_true", help="relê todos os .pptx, ignorando os hashes")
    ap.add_argument("--forcar", action="store_true", help="ignora as travas de segurança")
    ap.add_argument("--inspecionar", metavar="PPTX", help="mostra as formas lidas de um .pptx e o resultado")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if args.inspecionar:
        from extrator import extrair, inspecionar

        caminho = Path(args.inspecionar)
        saida = {"formas": inspecionar(caminho), "resultado": extrair(caminho, caminho.name)}
        texto = json.dumps(saida, ensure_ascii=False, indent=2)
        destino = caminho.with_suffix(".inspecao.json")
        destino.write_text(texto, encoding="utf-8")
        print(f"Inspeção salva em {destino}")
        return 0

    configurar_log(args.verbose)
    try:
        return executar(args)
    except ErroConfig as e:
        log.error("configuração: %s", e)
        return 2
    except ErroSincronizacao as e:
        log.error("%s", e)
        return 1
    except subprocess.TimeoutExpired as e:
        log.error("tempo esgotado em %s — rede lenta ou bloqueada?", " ".join(e.cmd))
        return 1
    except Exception:
        log.exception("erro inesperado")
        return 1


if __name__ == "__main__":
    sys.exit(main())
