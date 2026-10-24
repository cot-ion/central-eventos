"""Teste de ponta a ponta da sincronização, com um "GitHub" falso (repositório git local)."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from argparse import Namespace
from pathlib import Path

AUTOMACAO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMACAO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sincronizar  # noqa: E402
from gerar_exemplo import gerar  # noqa: E402


def sh(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


class TestSincronizar(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        remoto, clone, self.pasta = self.tmp / "remoto.git", self.tmp / "clone", self.tmp / "sharepoint"
        self.pasta.mkdir()
        sh("git", "init", "--quiet", "--bare", "-b", "main", str(remoto), cwd=self.tmp)
        sh("git", "clone", "--quiet", str(remoto), str(clone), cwd=self.tmp)
        (clone / "data").mkdir()
        (clone / "data" / "eventos.json").write_text('{"versao": 1, "arquivos": {}, "eventos": []}\n')
        sh("git", "add", ".", cwd=clone)
        sh("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init", cwd=clone)
        sh("git", "push", "--quiet", "origin", "main", cwd=clone)
        self.remoto, self.clone = remoto, clone

        self.cfg = self.tmp / "config.ini"
        self.cfg.write_text(f"[pastas]\npptx = {self.pasta}\n[seguranca]\nestabilidade_segundos = 0\n", encoding="utf-8")
        self._orig = (sincronizar.REPO, sincronizar.TRAVA)
        sincronizar.REPO = clone
        sincronizar.TRAVA = self.tmp / "lock"

    def tearDown(self):
        sincronizar.REPO, sincronizar.TRAVA = self._orig
        shutil.rmtree(self.tmp, ignore_errors=True)

    def rodar(self, **kw):
        args = Namespace(config=str(self.cfg), simular=False, reprocessar=False, forcar=False)
        for k, v in kw.items():
            setattr(args, k, v)
        return sincronizar.executar(args)

    def commits_remotos(self):
        r = subprocess.run(["git", "--git-dir", str(self.remoto), "log", "--format=%s", "main"], capture_output=True, text=True)
        return r.stdout.strip().splitlines()

    def json_remoto(self):
        r = subprocess.run(
            ["git", "--git-dir", str(self.remoto), "show", "main:data/eventos.json"], capture_output=True, text=True
        )
        return json.loads(r.stdout)

    def test_fluxo_completo(self):
        gerar(self.pasta / "Modelos COT.pptx")
        (self.pasta / "~$Modelos COT.pptx").write_bytes(b"lock")  # bloqueio do PowerPoint: ignorado

        self.assertEqual(self.rodar(), 0)
        dados = self.json_remoto()
        self.assertEqual(len(dados["eventos"]), 2)
        self.assertEqual(list(dados["arquivos"]), ["Modelos COT.pptx"])
        self.assertEqual(len(dados["arquivos"]["Modelos COT.pptx"]["sha256"]), 64)
        self.assertIn("Porchat", " ".join(dados["anotacoes"]))
        self.assertTrue(dados["gerado_em"])
        self.assertEqual(len(self.commits_remotos()), 2)

        # sem mudanças → sem commit
        self.assertEqual(self.rodar(), 0)
        self.assertEqual(len(self.commits_remotos()), 2)

        # mesmo arquivo copiado com outro nome → IDs diferentes, novo commit
        shutil.copy(self.pasta / "Modelos COT.pptx", self.pasta / "Outro.pptx")
        self.assertEqual(self.rodar(), 0)
        self.assertEqual(len(self.json_remoto()["eventos"]), 4)
        self.assertEqual(len(self.commits_remotos()), 3)

        # pasta esvaziada (OneDrive desconectado) → barrado pela trava de segurança
        for p in self.pasta.glob("*.pptx"):
            p.unlink()
        with self.assertRaises(sincronizar.ErroSincronizacao):
            self.rodar()
        self.assertEqual(len(self.json_remoto()["eventos"]), 4)

        # remoção intencional com --forcar
        self.assertEqual(self.rodar(forcar=True), 0)
        self.assertEqual(self.json_remoto()["eventos"], [])

    def test_pasta_inexistente_nao_publica(self):
        shutil.rmtree(self.pasta)
        with self.assertRaises(sincronizar.ErroSincronizacao):
            self.rodar()
        self.assertEqual(len(self.commits_remotos()), 1)

    def test_arquivo_corrompido_mantem_versao_anterior(self):
        arq = self.pasta / "Modelos.pptx"
        gerar(arq)
        self.rodar()
        arq.write_bytes(b"isto nao e um pptx")
        os.utime(arq, (time.time() - 10, time.time() - 10))
        self.assertEqual(self.rodar(), 0)
        dados = self.json_remoto()
        self.assertEqual(len(dados["eventos"]), 2)  # eventos antigos preservados
        self.assertIn("erro", dados["arquivos"]["Modelos.pptx"])

    def test_simular_nao_publica(self):
        gerar(self.pasta / "Modelos.pptx")
        self.assertEqual(self.rodar(simular=True), 0)
        self.assertEqual(len(self.commits_remotos()), 1)


if __name__ == "__main__":
    unittest.main()
