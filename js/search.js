import { praca as pracaInfo, parseSinal, origem } from "./data.js";

/** Minúsculas, sem acentos, espaços normalizados. */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/\s+/g, " ")
    .trim();
}

// Palavras que não ajudam a busca ("ion x sp", "estúdio de sp"…).
const STOP = new Set(["x", "de", "do", "da", "com", "e", "o", "a", "no", "na"]);

function tokens(query) {
  return normalize(query)
    .split(/[\s,;/]+/)
    .filter((t) => t && !STOP.has(t));
}

function sinaisDe(evento) {
  const out = [];
  for (const tipo of ["video", "audio"]) {
    const fluxo = evento[tipo];
    if (!fluxo) continue;
    for (const link of fluxo.links) {
      for (const raw of [...link.ida, ...link.volta]) {
        const s = parseSinal(raw);
        if (!s.vazio) out.push({ ...s, tipo });
      }
    }
  }
  return out;
}

/**
 * Pré-calcula, para cada evento, os campos pesquisáveis com seus pesos.
 * Peso maior = o campo diz mais sobre "qual evento é este".
 */
export function buildIndex(eventos) {
  return eventos.map((ev, ordem) => {
    const praca = pracaInfo(ev.praca);
    const nos = [...(ev.video?.nos ?? []), ...(ev.audio?.nos ?? [])].map((n) => parseSinal(n).nome);
    const sinais = sinaisDe(ev);
    const campos = [
      { peso: 6, rotulo: "nome", texto: ev.nome },
      { peso: 5, rotulo: "título", texto: ev.titulo },
      { peso: 5, rotulo: "título", texto: ev.titulo.replace(/\s+/g, "") }, // "IONxSP"
      { peso: 4, rotulo: "praça", texto: `${ev.praca} ${praca?.nome ?? ""}` },
      { peso: 4, rotulo: "estúdio", texto: ev.estudio },
      { peso: 4, rotulo: "controle", texto: ev.controle },
      { peso: 3, rotulo: "apelido", texto: (ev.apelidos ?? []).join(" · ") },
      { peso: 2, rotulo: "bloco", texto: [...new Set(nos)].join(" · ") },
      { peso: 2, rotulo: "station", texto: ev.station ?? "" },
      { peso: 1, rotulo: "origem", texto: `${origem(ev).longa} ${ev.fonte?.arquivo ?? ""}` },
      ...(ev.emConstrucao ? [{ peso: 2, rotulo: "status", texto: "em construção" }] : []),
      ...sinais.map((s) => ({
        peso: 1.5,
        rotulo: s.tipo === "video" ? "sinal de vídeo" : "sinal de áudio",
        texto: s.via ? `${s.nome} · ${s.via}` : s.nome,
        sinal: s.nome,
      })),
      ...(ev.canais ?? []).flatMap((g) => [
        { peso: 1, rotulo: "canais", texto: g.titulo },
        { peso: 0.5, rotulo: "canais", texto: `${g.titulo}: ${g.canais.filter(Boolean).join(", ")}` },
      ]),
    ].map((c) => ({ ...c, norm: normalize(c.texto) }));
    return { evento: ev, ordem, campos };
  });
}

function matchScore(norm, token) {
  // Avalia todas as ocorrências e fica com a melhor: palavra inteira > início
  // de palavra > meio da palavra. Números só valem no início de palavra
  // ("6" não deve achar "16").
  const numero = /^\d+$/.test(token);
  let best = 0;
  for (let idx = norm.indexOf(token); idx !== -1; idx = norm.indexOf(token, idx + 1)) {
    const inicioPalavra = idx === 0 || /[\s·/+(\-_:,]/.test(norm[idx - 1]);
    const palavraInteira = inicioPalavra && !/[a-z0-9]/.test(norm[idx + token.length] ?? "");
    const v = palavraInteira ? 1 : inicioPalavra ? 0.8 : numero ? 0 : 0.45;
    if (v > best) best = v;
    if (best === 1) break;
  }
  return best;
}

/**
 * Retorna eventos em que TODOS os termos aparecem em algum campo,
 * ordenados por relevância, com o melhor trecho para mostrar como contexto.
 */
export function search(index, query, { praca } = {}) {
  const ts = tokens(query);
  const pool = praca ? index.filter((i) => i.evento.praca === praca) : index;
  if (!ts.length) return pool.map((i) => ({ evento: i.evento, ordem: i.ordem, score: 0, contexto: null, sinais: [] }));

  const results = [];
  for (const item of pool) {
    let total = 0;
    let ok = true;
    for (const t of ts) {
      let best = 0;
      for (const c of item.campos) best = Math.max(best, matchScore(c.norm, t) * c.peso);
      if (!best) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) {
      // Contexto: o campo que cobre mais termos de uma vez (ex.: "PR RX 12"
      // dentro de um único sinal), ignorando nome/título que já aparecem.
      let melhorContexto = null;
      let melhorCobertura = 0;
      const sinais = new Set();
      for (const c of item.campos) {
        const cobertura = ts.filter((t) => matchScore(c.norm, t)).length;
        if (c.sinal && cobertura === ts.length) sinais.add(c.sinal);
        if (c.peso >= 5 || !cobertura) continue;
        if (cobertura > melhorCobertura || (cobertura === melhorCobertura && c.peso > melhorContexto.peso)) {
          melhorContexto = c;
          melhorCobertura = cobertura;
        }
      }
      if (melhorCobertura === ts.length) total += 3; // todos os termos no mesmo campo
      results.push({
        evento: item.evento,
        ordem: item.ordem,
        score: total,
        contexto: melhorContexto ? { rotulo: melhorContexto.rotulo, texto: melhorContexto.texto } : null,
        sinais: [...sinais],
      });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.ordem - b.ordem);
}

/** Envolve os termos buscados em <mark>, preservando o texto original. */
export function highlight(text, query, escape) {
  const ts = tokens(query).sort((a, b) => b.length - a.length);
  const safe = escape(text);
  if (!ts.length) return safe;
  const norm = normalize(text);
  // `normalize` preserva o comprimento caractere a caractere para os textos
  // usados aqui (letras acentuadas viram 1 letra), então os índices batem.
  if (norm.length !== text.length) return safe;
  const marks = new Array(text.length).fill(false);
  for (const t of ts) {
    let from = 0;
    let idx;
    while ((idx = norm.indexOf(t, from)) !== -1) {
      for (let i = idx; i < idx + t.length; i++) marks[i] = true;
      from = idx + t.length;
    }
  }
  let out = "";
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] && !open) {
      out += "<mark>";
      open = true;
    } else if (!marks[i] && open) {
      out += "</mark>";
      open = false;
    }
    out += escape(text[i]);
  }
  if (open) out += "</mark>";
  return out;
}
