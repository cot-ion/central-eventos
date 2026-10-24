"""
Regressão com um .pptx real do infográfico (layout "ION x SP — 6 SP / controle ION").

O resultado da extração tem de ser igual ao modelo transcrito à mão do PDF
(id "ion-sp-6sp" em data/eventos.json). Ao receber novos layouts, copie um
exemplo para testes/exemplos/ e acrescente um teste aqui.
"""

import json
import sys
import unittest
from pathlib import Path

AUTOMACAO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMACAO))

from extrator import extrair  # noqa: E402

EXEMPLO = Path(__file__).parent / "exemplos" / "ION x SP - 6SP controle ION.pptx"


def manual(id_):
    dados = json.loads((AUTOMACAO.parent / "data" / "manual.json").read_text(encoding="utf-8"))
    return next(e for e in dados["eventos"] if e["id"] == id_)


class TestExemploReal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = extrair(EXEMPLO, EXEMPLO.name)
        cls.ev = cls.r["eventos"][0]
        cls.ref = manual("ion-sp-6sp")

    def test_um_evento_sem_avisos(self):
        self.assertEqual(len(self.r["eventos"]), 1)
        self.assertEqual(self.r["avisos"], [])
        self.assertEqual(self.r["ignorados"], [])

    def test_cabecalho(self):
        for campo in ("praca", "estudio", "controle", "nome"):
            self.assertEqual(self.ev[campo], self.ref[campo], campo)

    def test_video_igual_ao_pdf(self):
        self.assertEqual(self.ev["video"], self.ref["video"])

    def test_audio_igual_ao_pdf(self):
        self.assertEqual(self.ev["audio"], self.ref["audio"])

    def test_canais_iguais_ao_pdf(self):
        # (a transcrição manual escreveu "Câmeras 1, 2 e 3"; o slide tem "1,2")
        sem_espaco = lambda gs: [{**g, "titulo": g["titulo"].replace(" ", "")} for g in gs]
        self.assertEqual(sem_espaco(self.ev["canais"]), sem_espaco(self.ref["canais"]))


if __name__ == "__main__":
    unittest.main()
