/*
 * Os modelos de evento vêm de data/eventos.json, gerado pelo GitHub Actions a
 * partir dos .pptx que as baias enviam para pptx/ (ver baias/README.md).
 * Com ?fonte=teste na URL, o site lê data/eventos-teste.json (pasta pptx-teste/).
 * Este arquivo só guarda configuração de exibição e o carregamento.
 *
 * Formato de um sinal no JSON:
 *   { "nome": "CAMERA 1", "via": "PR RX SP-1" }          ida/volta normal
 *   { "nome": "MIC BY", "riscado": true }                desativado no modelo
 *   { "nome": "COT JB", "destaque": true }               em vermelho (a confirmar)
 *   { "nome": "PGM LIMPO", "gravar": true }              saída para gravação
 *   { "nome": "", "vazio": true }                        posição reservada
 */

export const PRACAS = {
  SP: { nome: "São Paulo", cor: "#f97316" },
  BHE: { nome: "Belo Horizonte", cor: "#a855f7" },
  RCE: { nome: "Recife", cor: "#10b981" },
  JB: { nome: "Jardim Botânico (RJ)", cor: "#0ea5e9" },
  EG: { nome: "Estúdios Globo", cor: "#ec4899" },
  G3: { nome: "G3", cor: "#eab308" },
  TVG: { nome: "Site TVG", cor: "#64748b" },
};

const PRACA_PADRAO = { nome: "", cor: "#64748b" };

export function praca(sigla) {
  return PRACAS[sigla] ?? { ...PRACA_PADRAO, nome: sigla ?? "" };
}

export const FONTE_TESTE = new URLSearchParams(location.search).get("fonte") === "teste";

export async function carregarDados() {
  const arquivo = FONTE_TESTE ? "data/eventos-teste.json" : "data/eventos.json";
  // no-cache: revalida sempre com o servidor, para pegar a última publicação.
  const res = await fetch(arquivo, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${arquivo}`);
  const dados = await res.json();
  if (!Array.isArray(dados.eventos)) throw new Error(`${arquivo} sem a lista 'eventos'`);
  return dados;
}

/** Normaliza um sinal do JSON (objeto) — aceita também a string antiga "NOME | VIA". */
export function parseSinal(raw) {
  if (raw && typeof raw === "object") {
    if (raw.vazio || !raw.nome) return { vazio: true, nome: "", via: "" };
    return {
      nome: raw.nome,
      via: raw.via ?? "",
      riscado: !!raw.riscado,
      destaque: !!raw.destaque,
      gravar: !!raw.gravar,
    };
  }
  if (!raw) return { vazio: true, nome: "", via: "" };
  let s = raw;
  const sinal = { riscado: false, destaque: false, gravar: false };
  while (/^[~!^]/.test(s)) {
    if (s[0] === "~") sinal.riscado = true;
    if (s[0] === "!") sinal.destaque = true;
    if (s[0] === "^") sinal.gravar = true;
    s = s.slice(1);
  }
  const [nome, via = ""] = s.split("|").map((p) => p.trim());
  return { ...sinal, nome, via };
}

/** Descrição curta da origem de um evento ("Slide 3 · arquivo.pptx"). */
export function origem(ev) {
  const f = ev.fonte ?? {};
  const unidade = /\.pdf$/i.test(f.arquivo ?? "") ? "Pág." : "Slide";
  return { curta: `${unidade} ${f.slide ?? "?"}`, longa: `${unidade} ${f.slide ?? "?"} · ${f.arquivo ?? ""}` };
}
