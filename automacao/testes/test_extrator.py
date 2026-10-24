"""Testes do extrator com um .pptx sintético no padrão do infográfico.

    cd automacao
    python -m unittest discover -s testes -v
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extrator import extrair  # noqa: E402
from gerar_exemplo import gerar  # noqa: E402


def nomes(lista):
    return [s["nome"] for s in lista]


class TestExtrator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        caminho = gerar(Path(cls.tmp.name) / "exemplo.pptx")
        cls.r = extrair(caminho, "Pasta/exemplo.pptx")
        cls.sp, cls.tvg = cls.r["eventos"]

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_slides_reconhecidos(self):
        self.assertEqual(len(self.r["eventos"]), 2)
        self.assertEqual(self.r["anotacoes"], ["Estudio j – backstage/ eliminação", "Ctl MG3 - Porchat ao vivo"])
        self.assertEqual(self.r["ignorados"], ["slide 4: sem os rótulos VIDEO/AUDIO"])
        self.assertEqual(self.r["avisos"], [])

    def test_cabecalho(self):
        self.assertEqual(self.sp["titulo"], "IONxSP")
        self.assertEqual((self.sp["praca"], self.sp["estudio"], self.sp["controle"]), ("SP", "6 SP", "ION"))
        self.assertEqual(self.tvg["praca"], "TVG")
        self.assertEqual(self.tvg["modelo"], "TVG")

    def test_notas_do_slide(self):
        self.assertEqual(self.sp["nome"], "SP · Estúdio 6 SP com controle ION")
        self.assertEqual(self.sp["apelidos"], ["câmeras sp", "narração sp"])

    def test_id_estavel(self):
        self.assertRegex(self.sp["id"], r"^exemplo-s\d+$")
        self.assertEqual(self.sp["fonte"], {"arquivo": "Pasta/exemplo.pptx", "slide": 1, "slide_id": 256})

    def test_blocos(self):
        self.assertEqual(nomes(self.sp["video"]["nos"]), ["COT SP", "COT ION", "CTL ION", "EXIBE"])
        self.assertEqual(nomes(self.sp["audio"]["nos"]), ["COT SP", "COT ION", "CTL ION"])

    def test_ida_volta_e_via(self):
        l0 = self.sp["video"]["links"][0]
        self.assertEqual(
            l0["ida"],
            [
                {"nome": "CAMERA 1", "via": "PR RX SP-1"},
                {"nome": "CAMERA 2", "via": "PR RX SP-2"},
                {"nome": "CAMERA 3", "via": "PR RX SP-3"},
            ],
        )
        self.assertEqual(nomes(l0["volta"]), ["DIRETO TIT", "AUX TELÃO", "PGM COM CTL"])
        self.assertTrue(all(s["via"] == "PR TX LAWO E DR LAWO" for s in l0["volta"]))

    def test_formas_dentro_de_grupo(self):
        l1 = self.sp["video"]["links"][1]
        self.assertEqual(nomes(l1["ida"]), ["CAMERA 1", "CAMERA 2", "CAMERA 3", "DIRETO TIT", "DIRETO BY"])
        self.assertEqual(nomes(l1["volta"]), ["AUX TELÃO"])

    def test_gravar(self):
        ida = self.sp["video"]["links"][2]["ida"]
        self.assertEqual(ida, [{"nome": "PGM COM"}, {"nome": "PGM PROD"}, {"nome": "PGM LIMPO", "gravar": True}])
        self.assertEqual(self.tvg["video"]["nos"][-1], {"nome": "GRAVAR", "gravar": True})

    def test_audio(self):
        l1 = self.sp["audio"]["links"][1]
        self.assertEqual(l1["ida"][1], {"nome": "OVER", "via": "IFB EVNT"})
        self.assertEqual(l1["volta"], [{"nome": "MINUS", "via": "AUX AUD"}])

    def test_riscado_e_vermelho(self):
        self.assertEqual(self.tvg["video"]["links"][1]["ida"][2], {"nome": "PGM LIMPO SEM SONO", "riscado": True})
        produzido = self.sp["canais"][2]
        self.assertTrue(produzido["destaque"])

    def test_canais(self):
        self.assertEqual([g["titulo"] for g in self.sp["canais"]], ["Câmeras 1,2 e 3 SP", "PGM Comercializado", "PGM Produzido"])
        self.assertEqual(self.sp["canais"][0]["canais"], ["LAPELA NARRA", "LAPELA COMENTA", "MD NARRA", "MD COMENTA"])

    def test_notas_rodape(self):
        self.assertEqual(self.tvg["notas"], ["*Talkback (ch1), Foldback (ch2), Ponto 1 (ch3) e Ponto 2 (ch4)"])


if __name__ == "__main__":
    unittest.main()
