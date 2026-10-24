"""Testes do gerador do JSON do site (o que roda no GitHub Actions)."""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

AUTOMACAO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMACAO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from gerar_dados import gerar, ler_json  # noqa: E402
from gerar_exemplo import gerar as gerar_pptx  # noqa: E402

MANUAL = ler_json(AUTOMACAO.parent / "data" / "manual.json")


class TestGerarDados(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.pasta = self.tmp / "pptx"
        (self.pasta / "Sub pasta").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_pasta_inexistente_so_manuais(self):
        d = gerar(self.tmp / "nao-existe", MANUAL, {})
        self.assertEqual(len(d["eventos"]), len(MANUAL["eventos"]))

    def test_mescla_manual_e_pptx_com_manifesto(self):
        gerar_pptx(self.pasta / "Sub pasta" / "Modelos ção.pptx")
        (self.pasta / "~$Modelos ção.pptx").write_bytes(b"lock")
        (self.pasta / "manifest.json").write_text(
            json.dumps(
                {
                    "atualizado_por": "BAIA-07",
                    "token_expira_em": "2027-10-01T00:00:00Z",
                    "arquivos": {"Sub pasta/Modelos ção.pptx": {"enviado_por": "BAIA-07", "enviado_em": "2026-10-24T10:00:00Z"}},
                }
            ),
            encoding="utf-8-sig",  # o PowerShell 5.1 pode gravar com BOM
        )
        d = gerar(self.pasta, MANUAL, {})
        self.assertEqual(len(d["eventos"]), len(MANUAL["eventos"]) + 2)
        info = d["arquivos"]["Sub pasta/Modelos ção.pptx"]
        self.assertEqual(info["enviado_por"], "BAIA-07")
        self.assertEqual(len(info["sha256"]), 64)
        self.assertEqual(d["sincronizacao"]["token_expira_em"], "2027-10-01T00:00:00Z")
        self.assertIn("Porchat ao vivo", " ".join(d["anotacoes"]))
        self.assertEqual(len({e["id"] for e in d["eventos"]}), len(d["eventos"]))
        # manuais primeiro
        self.assertEqual(d["eventos"][0]["id"], MANUAL["eventos"][0]["id"])

    def test_manual_so_enquanto_nao_ha_pptx(self):
        self.assertEqual(len(gerar(self.pasta, MANUAL, {}, manual_so_sem_pptx=True)["eventos"]), len(MANUAL["eventos"]))
        gerar_pptx(self.pasta / "Infografico.pptx")
        d = gerar(self.pasta, MANUAL, {}, manual_so_sem_pptx=True)
        self.assertEqual(len(d["eventos"]), 2)
        self.assertFalse(any(a.get("manual") for a in d["arquivos"].values()))

    def test_ids_repetidos_ganham_sufixo(self):
        gerar_pptx(self.pasta / "A.pptx")
        shutil.copy(self.pasta / "A.pptx", self.pasta / "Sub pasta" / "A.pptx")  # mesmo nome de arquivo → mesmo ID
        d = gerar(self.pasta, {}, {})
        ids = [e["id"] for e in d["eventos"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(any(i.endswith("-2") for i in ids))

    def test_arquivo_corrompido_mantem_versao_anterior(self):
        gerar_pptx(self.pasta / "M.pptx")
        anterior = gerar(self.pasta, {}, {})
        (self.pasta / "M.pptx").write_bytes(b"isto nao e um pptx")
        d = gerar(self.pasta, {}, anterior)
        self.assertIn("erro", d["arquivos"]["M.pptx"])
        self.assertEqual([e["id"] for e in d["eventos"]], [e["id"] for e in anterior["eventos"]])

    def test_corrompido_sem_anterior_nao_quebra(self):
        (self.pasta / "M.pptx").write_bytes(b"lixo")
        d = gerar(self.pasta, {}, {})
        self.assertEqual(d["eventos"], [])
        self.assertIn("erro", d["arquivos"]["M.pptx"])


if __name__ == "__main__":
    unittest.main()
