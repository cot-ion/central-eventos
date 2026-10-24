"""
Regressão com o infográfico completo (21 slides, imagens trocadas por 1 pixel).

Cada um dos 19 modelos extraídos tem de ser igual ao transcrito à mão do PDF
(data/manual.json), ignorando acentos, espaços e ponto final — a transcrição
manual acentuou palavras que no slide estão sem acento ("COERENCIA", "TELAO").
"""

import json
import sys
import unicodedata
import unittest
from pathlib import Path

AUTOMACAO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMACAO))

from extrator import extrair  # noqa: E402

EXEMPLO = Path(__file__).parent / "exemplos" / "Infografico completo (sem imagens).pptx"


def norm(valor):
    """Compara só o que importa: sem acento, sem espaço, sem ponto final."""
    if isinstance(valor, dict):
        return {k: norm(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [norm(v) for v in valor]
    if isinstance(valor, str):
        sem_acento = "".join(c for c in unicodedata.normalize("NFD", valor) if unicodedata.category(c) != "Mn")
        return sem_acento.replace(" ", "").rstrip(".").upper()
    return valor


class TestInfograficoCompleto(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = extrair(EXEMPLO, EXEMPLO.name)
        cls.extraidos = {e["fonte"]["slide"]: e for e in cls.r["eventos"]}
        manual = json.loads((AUTOMACAO.parent / "data" / "manual.json").read_text(encoding="utf-8"))
        cls.manuais = {e["fonte"]["slide"]: e for e in manual["eventos"]}

    def test_19_modelos_sem_avisos(self):
        self.assertEqual(sorted(self.extraidos), list(range(1, 20)))
        self.assertEqual(self.r["avisos"], [])
        self.assertEqual(len(self.r["ignorados"]), 2)  # slides finais sem diagrama

    def test_anotacoes(self):
        self.assertIn("Porchat", " ".join(self.r["anotacoes"]))

    def test_cada_slide_igual_a_transcricao(self):
        for n, ref in self.manuais.items():
            ev = self.extraidos[n]
            with self.subTest(slide=n, titulo=ref["titulo"]):
                for campo in ("praca", "estudio", "controle", "video", "audio", "canais", "notas", "emConstrucao", "station", "modelo"):
                    self.assertEqual(norm(ev.get(campo)), norm(ref.get(campo)), campo)


if __name__ == "__main__":
    unittest.main()
