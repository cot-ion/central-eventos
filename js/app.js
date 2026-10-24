import { carregarDados, praca, parseSinal, origem } from "./data.js";
import { buildIndex, search, highlight } from "./search.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let DADOS = {};
let EVENTOS = [];
let ANOTACOES = [];
let index = [];
const state = { query: "", praca: null, active: -1, homeScroll: 0 };

const el = {
  home: $("#view-home"),
  evento: $("#view-evento"),
  input: $("#search-input"),
  clear: $("#search-clear"),
  list: $("#search-list"),
  combo: $(".search"),
  chips: $("#praca-chips"),
  results: $("#results"),
  resultsTitle: $("#results-title"),
  resultsCount: $("#results-count"),
  notes: $("#anotacoes"),
  dialog: $("#original-dialog"),
};

/* ---------------------------------------------------------------- HOME --- */

function pracaBadge(sigla) {
  const p = praca(sigla);
  return `<span class="praca" style="--praca:${p?.cor ?? "#64748b"}" title="${esc(p?.nome ?? sigla)}">${esc(sigla)}</span>`;
}

function contagemSinais(ev) {
  const conta = (fluxo) =>
    new Set(
      (fluxo?.links ?? []).flatMap((l) => [...l.ida, ...l.volta]).map(parseSinal).filter((s) => !s.vazio).map((s) => s.nome)
    ).size;
  return { video: conta(ev.video), audio: conta(ev.audio) };
}

function miniFlow(nos) {
  return `<p class="mini-flow" aria-label="Fluxo de vídeo">${nos
    .map((n) => `<span>${esc(parseSinal(n).nome)}</span>`)
    .join('<i aria-hidden="true">→</i>')}</p>`;
}

function renderChips() {
  const contagem = {};
  for (const ev of EVENTOS) contagem[ev.praca] = (contagem[ev.praca] ?? 0) + 1;
  const chip = (sigla, label, n) => {
    const on = state.praca === sigla;
    const cor = sigla ? praca(sigla).cor : "var(--accent)";
    return `<button type="button" class="chip${on ? " on" : ""}" data-praca="${sigla ?? ""}" aria-pressed="${on}" style="--praca:${cor}">
      ${esc(label)}<span>${n}</span></button>`;
  };
  el.chips.innerHTML =
    chip(null, "Todas", EVENTOS.length) +
    Object.keys(contagem)
      .filter(Boolean)
      .map((s) => chip(s, s, contagem[s]))
      .join("");
}

function renderCards() {
  const res = search(index, state.query, { praca: state.praca });
  const q = state.query.trim();
  el.resultsTitle.textContent = q
    ? `Resultados para “${q}”`
    : state.praca
      ? `Modelos — ${praca(state.praca).nome || state.praca}`
      : "Todos os modelos";
  el.resultsCount.textContent = `${res.length} ${res.length === 1 ? "modelo" : "modelos"}`;

  if (!res.length) {
    el.results.innerHTML = `<div class="empty">
      <strong>Nenhum modelo encontrado.</strong>
      <p>Tente outro termo — por exemplo a praça (SP, BHE, RCE, JB, EG), o estúdio, o controle ou o nome de um sinal.</p>
    </div>`;
    return;
  }

  el.results.innerHTML = res
    .map(({ evento: ev, contexto }) => {
      const n = contagemSinais(ev);
      return `<a class="card" href="#/evento/${ev.id}" style="--praca:${praca(ev.praca).cor}">
        <div class="card-top">
          ${pracaBadge(ev.praca)}
          <span class="card-page">${esc(origem(ev).curta)}</span>
          ${ev.emConstrucao ? '<span class="tag warn">Em construção</span>' : ""}
        </div>
        <h3>${highlight(ev.nome, q, esc)}</h3>
        <p class="card-sub">${highlight(ev.titulo, q, esc)}</p>
        <dl class="card-meta">
          <div><dt>Estúdio</dt><dd>${highlight(ev.estudio, q, esc)}</dd></div>
          <div><dt>Controle</dt><dd>${highlight(ev.controle, q, esc)}</dd></div>
        </dl>
        ${ev.video?.nos?.length ? miniFlow(ev.video.nos) : ""}
        ${contexto ? `<p class="card-ctx"><span>${esc(contexto.rotulo)}</span> ${highlight(contexto.texto, q, esc)}</p>` : ""}
        <div class="card-foot">
          <span><b>${n.video}</b> sinais de vídeo</span>
          <span><b>${n.audio}</b> de áudio</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      </a>`;
    })
    .join("");
}

function renderSuggestions() {
  const q = state.query.trim();
  if (!q) return closeSuggestions();
  const res = search(index, q, { praca: state.praca }).slice(0, 7);
  el.combo.setAttribute("aria-expanded", "true");
  el.list.hidden = false;
  if (!res.length) {
    el.list.innerHTML = `<li class="sugg-empty">Nada encontrado para “${esc(q)}”.</li>`;
    state.active = -1;
    return;
  }
  state.active = Math.min(Math.max(state.active, 0), res.length - 1);
  el.list.innerHTML = res
    .map(
      ({ evento: ev, contexto }, i) => `<li role="option" id="sugg-${i}" class="sugg${i === state.active ? " active" : ""}"
        aria-selected="${i === state.active}" data-id="${ev.id}">
        ${pracaBadge(ev.praca)}
        <span class="sugg-text">
          <strong>${highlight(ev.nome, q, esc)}</strong>
          <small>${contexto ? `${esc(contexto.rotulo)}: ${highlight(contexto.texto, q, esc)}` : `${esc(ev.titulo)} · Estúdio ${esc(ev.estudio)} · Controle ${esc(ev.controle)}`}</small>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </li>`
    )
    .join("");
  el.input.setAttribute("aria-activedescendant", `sugg-${state.active}`);
}

function closeSuggestions() {
  el.list.hidden = true;
  el.list.innerHTML = "";
  el.combo.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
  state.active = -1;
}

function openEvento(id) {
  closeSuggestions();
  location.hash = `#/evento/${id}`;
}

function renderNotes() {
  el.notes.hidden = !ANOTACOES.length;
  el.notes.innerHTML = `<h2>Anotações</h2><ul>${ANOTACOES.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`;
}

/* ------------------------------------------------------------- EVENTO --- */

function renderSinal(raw, dir, tipo) {
  const s = parseSinal(raw);
  if (s.vazio) {
    return `<li class="sig vazio ${dir}"><span class="pill">reservado</span><span class="wire"></span></li>`;
  }
  const cls = ["sig", dir, s.riscado && "riscado", s.destaque && "destaque", s.gravar && "rec"].filter(Boolean).join(" ");
  const title = [s.nome, s.via && `via ${s.via}`, s.riscado && "desativado neste modelo"].filter(Boolean).join(" — ");
  return `<li class="${cls}" data-sinal="${esc(s.nome)}" data-tipo="${tipo}">
    <button type="button" class="pill" title="${esc(title)}">${s.gravar ? '<i class="rec-dot"></i>' : ""}${esc(s.nome)}</button>
    <span class="wire">${s.via ? `<em>${esc(s.via)}</em>` : ""}</span>
    ${s.gravar ? '<span class="rec-tag">GRAVAR</span>' : ""}
  </li>`;
}

function renderNo(raw, i, total) {
  const s = parseSinal(raw);
  const papel = i === 0 ? "origem" : i === total - 1 ? "destino" : "";
  return `<div class="node${s.destaque ? " destaque" : ""}${s.gravar ? " rec" : ""}">
    <span class="node-step">${i + 1}</span>
    <strong>${esc(s.nome)}</strong>
    ${papel ? `<small>${papel}</small>` : ""}
  </div>`;
}

function renderFluxo(fluxo, tipo) {
  const partes = [];
  fluxo.nos.forEach((no, i) => {
    partes.push(renderNo(no, i, fluxo.nos.length));
    const link = fluxo.links[i];
    if (!link) return;
    const destino = parseSinal(fluxo.nos[i + 1]).nome;
    const origem = parseSinal(no).nome;
    partes.push(`<div class="lane">
      ${
        link.ida.length
          ? `<div class="lane-group"><span class="lane-label ida">Ida <b>→ ${esc(destino)}</b></span>
             <ul>${link.ida.map((s) => renderSinal(s, "ida", tipo)).join("")}</ul></div>`
          : ""
      }
      ${
        link.volta.length
          ? `<div class="lane-group"><span class="lane-label volta">Retorno <b>← ${esc(origem)}</b></span>
             <ul>${link.volta.map((s) => renderSinal(s, "volta", tipo)).join("")}</ul></div>`
          : ""
      }
      ${!link.ida.length && !link.volta.length ? '<p class="lane-none">sem sinais</p>' : ""}
    </div>`);
  });
  return `<div class="flow" style="--cols:${fluxo.nos.length}">${partes.join("")}</div>`;
}

function renderCanais(grupos) {
  return `<div class="channels">${grupos
    .map(
      (g) => `<article class="ch-card${g.destaque ? " destaque" : ""}">
        <header><h4>${esc(g.titulo)}</h4>${g.destaque ? '<span class="tag danger">a confirmar</span>' : ""}</header>
        <ol>${g.canais
          .map(
            (c, i) =>
              `<li${c ? "" : ' class="livre"'}><span class="ch-n">CH ${i + 1}</span><span>${c ? esc(c) : "livre"}</span></li>`
          )
          .join("")}</ol>
      </article>`
    )
    .join("")}</div>`;
}

function renderEvento(id, querySinais = []) {
  const ev = EVENTOS.find((e) => e.id === id);
  if (!ev) {
    el.evento.innerHTML = `<div class="empty"><strong>Modelo não encontrado.</strong><p><a href="#/">Voltar para a busca</a></p></div>`;
    return;
  }
  document.title = `${ev.nome} — Central de Eventos`;
  const p = praca(ev.praca);
  const idx = EVENTOS.indexOf(ev);
  const prev = EVENTOS[idx - 1];
  const next = EVENTOS[idx + 1];

  el.evento.innerHTML = `
    <nav class="crumbs">
      <a href="#/" class="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Buscar modelos</a>
    </nav>

    <header class="ev-head" style="--praca:${p?.cor}">
      <div class="ev-head-top">
        ${pracaBadge(ev.praca)}
        <span class="muted">${esc(p?.nome ?? "")}</span>
        <span class="card-page" title="Arquivo de origem">${esc(origem(ev).longa)}</span>
        ${ev.emConstrucao ? '<span class="tag warn">Em construção</span>' : ""}
      </div>
      <h1>${esc(ev.nome)}</h1>
      <p class="ev-title">${esc(ev.titulo)}</p>
      <dl class="ev-facts">
        ${ev.modelo ? `<div><dt>Modelo</dt><dd>${esc(ev.modelo)}</dd></div>` : ""}
        <div><dt>Estúdio</dt><dd>${esc(ev.estudio)}</dd></div>
        <div><dt>Controle</dt><dd>${esc(ev.controle)}</dd></div>
        ${ev.station ? `<div><dt>Station</dt><dd>${esc(ev.station)}</dd></div>` : ""}
      </dl>
      <div class="ev-actions">
        ${ev.imagem ? `<button type="button" class="btn" data-original="${esc(ev.id)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /></svg>
          Ver diagrama original
        </button>` : ""}
        <button type="button" class="btn ghost" data-share>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
          Copiar link
        </button>
      </div>
    </header>

    <nav class="ev-tabs" aria-label="Seções">
      ${ev.video?.nos?.length ? '<a href="#sec-video" data-sec="sec-video">Vídeo</a>' : ""}
      ${ev.audio?.nos?.length ? '<a href="#sec-audio" data-sec="sec-audio">Áudio</a>' : ""}
      ${ev.canais?.length ? '<a href="#sec-canais" data-sec="sec-canais">Canais</a>' : ""}
    </nav>

    <div class="legend" aria-label="Legenda">
      <span><i class="lg ida"></i>Ida (esquerda → direita)</span>
      <span><i class="lg volta"></i>Retorno</span>
      <span><i class="lg via"></i>meio / transporte</span>
      <span><i class="rec-dot"></i>Gravação</span>
      <span class="lg-tip">Toque num sinal para rastreá-lo no fluxo.</span>
    </div>

    ${
      ev.video?.nos?.length
        ? `<section class="ev-sec" id="sec-video"><h2><span class="sec-ico video"></span>Vídeo</h2>${renderFluxo(ev.video, "video")}</section>`
        : ""
    }

    ${
      ev.audio?.nos?.length
        ? `<section class="ev-sec" id="sec-audio"><h2><span class="sec-ico audio"></span>Áudio</h2>${renderFluxo(ev.audio, "audio")}</section>`
        : ""
    }

    ${
      ev.canais?.length
        ? `<section class="ev-sec" id="sec-canais"><h2><span class="sec-ico canais"></span>Mapa de canais</h2>${renderCanais(ev.canais)}</section>`
        : ""
    }

    ${ev.notas?.length ? `<section class="ev-notes">${ev.notas.map((n) => `<p>${esc(n)}</p>`).join("")}</section>` : ""}

    <nav class="ev-pager">
      ${prev ? `<a href="#/evento/${prev.id}"><small>← Anterior</small><span>${esc(prev.nome)}</span></a>` : "<span></span>"}
      ${next ? `<a href="#/evento/${next.id}" class="next"><small>Próximo →</small><span>${esc(next.nome)}</span></a>` : "<span></span>"}
    </nav>
  `;

  if (querySinais.length) setTrace(querySinais);
}

function setTrace(nomes) {
  const alvo = new Set(nomes);
  el.evento.querySelectorAll(".flow").forEach((f) => {
    let algum = false;
    f.querySelectorAll(".sig[data-sinal]").forEach((li) => {
      const on = alvo.has(li.dataset.sinal);
      li.classList.toggle("traced", on);
      algum ||= on;
    });
    f.classList.toggle("tracing", algum);
  });
}

/* -------------------------------------------------------------- STATUS --- */

function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function renderStatus() {
  document.title = "Status da sincronização — Central de Eventos";
  const arquivos = Object.entries(DADOS.arquivos ?? {});
  const comProblema = arquivos.filter(([, a]) => a.erro || a.avisos?.length).length;
  el.evento.innerHTML = `
    <nav class="crumbs"><a href="#/" class="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Buscar modelos</a></nav>
    <header class="ev-head">
      <h1>Status da sincronização</h1>
      <p class="muted">Modelos lidos automaticamente dos .pptx da pasta do SharePoint.</p>
      <dl class="ev-facts">
        <div><dt>Última publicação</dt><dd>${esc(dataHora(DADOS.gerado_em))}</dd></div>
        <div><dt>Arquivos</dt><dd>${arquivos.length}</dd></div>
        <div><dt>Modelos</dt><dd>${EVENTOS.length}</dd></div>
        <div><dt>Com avisos</dt><dd>${comProblema}</dd></div>
      </dl>
    </header>
    <div class="status-list">${arquivos
      .map(
        ([nome, a]) => `<article class="status-item${a.erro ? " erro" : a.avisos?.length ? " aviso" : ""}">
          <header>
            <strong>${esc(nome)}</strong>
            ${a.manual ? '<span class="tag warn">importação manual</span>' : ""}
            ${a.erro ? '<span class="tag danger">erro</span>' : ""}
          </header>
          <p class="muted">${a.eventos ?? 0} modelo(s)${a.processado_em ? ` · lido em ${esc(dataHora(a.processado_em))}` : ""}${
            a.sha256 ? ` · <code title="SHA-256">${esc(a.sha256.slice(0, 12))}</code>` : ""
          }</p>
          ${a.descricao ? `<p>${esc(a.descricao)}</p>` : ""}
          ${a.erro ? `<p class="status-erro">${esc(a.erro)} — a versão anterior foi mantida.</p>` : ""}
          ${a.avisos?.length ? `<ul>${a.avisos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${a.ignorados?.length ? `<p class="muted">Slides que não são modelos (ignorados): ${esc(a.ignorados.join("; "))}</p>` : ""}
        </article>`
      )
      .join("")}</div>`;
}

/* -------------------------------------------------------------- ROUTER --- */

let lastQuerySinais = [];

function route() {
  const m = location.hash.match(/^#\/evento\/([\w-]+)/);
  if (location.hash === "#/status") {
    if (!el.home.hidden) state.homeScroll = window.scrollY;
    el.home.hidden = true;
    el.evento.hidden = false;
    renderStatus();
    window.scrollTo(0, 0);
  } else if (m) {
    if (!el.home.hidden) state.homeScroll = window.scrollY;
    el.home.hidden = true;
    el.evento.hidden = false;
    renderEvento(m[1], lastQuerySinais);
    window.scrollTo(0, 0);
  } else if (!location.hash.startsWith("#sec-")) {
    document.title = "Central de Eventos";
    el.evento.hidden = true;
    el.home.hidden = false;
    lastQuerySinais = [];
    window.scrollTo(0, state.homeScroll);
  }
}

/* -------------------------------------------------------------- EVENTS --- */

function onQuery() {
  state.query = el.input.value;
  state.active = 0;
  el.clear.hidden = !state.query;
  renderSuggestions();
  renderCards();
}

function rememberQuerySinais(id) {
  const r = search(index, state.query).find((x) => x.evento.id === id);
  lastQuerySinais = r?.sinais ?? [];
}

el.input.addEventListener("input", onQuery);
el.input.addEventListener("focus", () => state.query && renderSuggestions());
el.input.addEventListener("keydown", (e) => {
  const items = [...el.list.querySelectorAll(".sugg")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!items.length) return;
    e.preventDefault();
    state.active = (state.active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    renderSuggestions();
  } else if (e.key === "Enter") {
    const item = items[state.active] ?? items[0];
    if (item) {
      e.preventDefault();
      rememberQuerySinais(item.dataset.id);
      openEvento(item.dataset.id);
    }
  } else if (e.key === "Escape") {
    if (!el.list.hidden) closeSuggestions();
    else {
      el.input.value = "";
      onQuery();
    }
  }
});

el.list.addEventListener("mousedown", (e) => e.preventDefault()); // mantém o foco no input
el.list.addEventListener("click", (e) => {
  const li = e.target.closest(".sugg");
  if (!li) return;
  rememberQuerySinais(li.dataset.id);
  openEvento(li.dataset.id);
});

el.input.addEventListener("blur", () => setTimeout(closeSuggestions, 120));

el.clear.addEventListener("click", () => {
  el.input.value = "";
  onQuery();
  el.input.focus();
});

el.chips.addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  state.praca = b.dataset.praca || null;
  renderChips();
  renderCards();
  if (state.query) renderSuggestions();
});

el.results.addEventListener("click", (e) => {
  const a = e.target.closest(".card");
  if (a) rememberQuerySinais(a.getAttribute("href").split("/").pop());
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== el.input && !el.home.hidden) {
    e.preventDefault();
    el.input.focus();
  }
});

el.evento.addEventListener("click", async (e) => {
  const pill = e.target.closest(".sig .pill");
  if (pill) {
    const nome = pill.closest(".sig").dataset.sinal;
    const ativo = pill.closest(".sig").classList.contains("traced") && el.evento.querySelector(".flow.tracing");
    setTrace(ativo ? [] : nome ? [nome] : []);
    return;
  }
  const tab = e.target.closest("[data-sec]");
  if (tab) {
    e.preventDefault();
    document.getElementById(tab.dataset.sec)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const orig = e.target.closest("[data-original]");
  if (orig) return openOriginal(orig.dataset.original);
  if (e.target.closest("[data-share]")) {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copiado");
    } catch {
      toast("Não foi possível copiar o link");
    }
  }
});

/* ------------------------------------------------------ ORIGINAL (PDF) --- */

function openOriginal(id) {
  const ev = EVENTOS.find((x) => x.id === id);
  if (!ev?.imagem) return;
  const img = $("#original-img");
  img.src = ev.imagem;
  img.alt = `${ev.titulo} — ${origem(ev).longa}`;
  $("#original-title").textContent = `${ev.titulo} — ${origem(ev).curta}`;
  el.dialog.classList.remove("zoom");
  $("#original-zoom").textContent = "Ampliar";
  el.dialog.showModal();
}

$("#original-zoom").addEventListener("click", () => {
  const z = el.dialog.classList.toggle("zoom");
  $("#original-zoom").textContent = z ? "Ajustar" : "Ampliar";
});
el.dialog.addEventListener("click", (e) => {
  if (e.target === el.dialog || e.target.closest("[data-close]")) el.dialog.close();
});

/* --------------------------------------------------------------- MISC --- */

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

// Botão "Instalar" (Android/Chrome/Edge). No iOS: Compartilhar → Adicionar à Tela de Início.
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#install-btn").hidden = false;
});
$("#install-btn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#install-btn").hidden = true;
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

window.addEventListener("hashchange", route);

async function iniciar() {
  try {
    const dados = await carregarDados();
    DADOS = dados;
    EVENTOS = dados.eventos;
    ANOTACOES = dados.anotacoes ?? [];
    index = buildIndex(EVENTOS);
    if (dados.gerado_em) {
      $("#atualizado").textContent = `Atualizado em ${dataHora(dados.gerado_em)} · `;
    }
  } catch (err) {
    console.error(err);
    el.results.innerHTML = `<div class="empty"><strong>Não foi possível carregar os modelos.</strong>
      <p>Verifique a conexão e recarregue a página.</p></div>`;
    return;
  }
  renderChips();
  renderCards();
  renderNotes();
  route();
}

iniciar();
