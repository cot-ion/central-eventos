/*
 * Modelos de evento — transcritos do "INFOGRÁFICO PRODUÇÕES COT 2025".
 * Cada objeto em EVENTOS corresponde a uma página do PDF.
 *
 * Para renomear um modelo, edite o campo `nome` (e opcionalmente `apelidos`,
 * que entram na busca). Nada mais precisa mudar.
 *
 * Sintaxe dos sinais (strings dentro de `ida` / `volta`):
 *   "NOME | VIA"   → sinal com o meio de transporte (VIA) escrito na seta
 *   "NOME"         → sinal sem meio informado
 *   "~NOME | VIA"  → sinal riscado / desativado no modelo
 *   "!NOME"        → sinal destacado (em vermelho no PDF — a confirmar)
 *   "^NOME"        → saída para gravação (GRAVAR)
 *   ""             → posição reservada / vazia no diagrama
 *
 * Cada fluxo (video / audio) tem `nos` (blocos, da esquerda para a direita)
 * e `links` (um a menos que `nos`): o que vai da esquerda para a direita
 * (`ida`) e o que volta (`volta`) entre dois blocos vizinhos.
 */

const MIX_COM = Array(4).fill("MIX COM FOGUETE");
const MIX_SEM = Array(4).fill("MIX SEM FOGUETE");
const PGM_LIMPO_8 = [
  "VOZ",
  "AMBIENTE MONO",
  "MIX SEM FOGUETE L",
  "MIX SEM FOGUETE R",
  "AUX CENTRAL APITO",
  "AUX CENTRAL APITO",
  "AMBIENTE L",
  "AMBIENTE R",
];
const NARRA_COMENTA = ["LAPELA NARRA", "LAPELA COMENTA", "MD NARRA", "MD COMENTA"];

const CANAIS_PADRAO = [
  { titulo: "PGM Comercializado", canais: MIX_COM },
  { titulo: "PGM Produzido", canais: MIX_SEM },
  { titulo: "PGM Limpo", canais: PGM_LIMPO_8 },
];

const SAIDA_CTL_ION = { ida: ["PGM COM", "PGM PROD", "^PGM LIMPO"], volta: [] };
const SAIDA_PROC = {
  ida: ["PROC PGM TIT | REM/PROC", "PROC PGM BY | REM/PROC", "PROC PGM VIA DR | REM/PROC", "^PGM LIMPO"],
  volta: [],
};

const NOTA_TALKBACK = "*Talkback (ch1), Foldback (ch2), Ponto 1 (ch3) e Ponto 2 (ch4).";

export const PRACAS = {
  SP: { nome: "São Paulo", cor: "#f97316" },
  BHE: { nome: "Belo Horizonte", cor: "#a855f7" },
  RCE: { nome: "Recife", cor: "#10b981" },
  JB: { nome: "Jardim Botânico (RJ)", cor: "#0ea5e9" },
  EG: { nome: "Estúdios Globo", cor: "#ec4899" },
  G3: { nome: "G3", cor: "#eab308" },
  TVG: { nome: "Site TVG", cor: "#64748b" },
};

export const ANOTACOES = [
  "Estúdio J — backstage / eliminação",
  "Ctl web — Angélica / live show",
  "Ctl MG2 — Domingão ao vivo",
  "Ctl MG3 — Porchat ao vivo",
];

export const EVENTOS = [
  {
    id: "ion-sp-6sp",
    pagina: 1,
    titulo: "ION x SP",
    nome: "SP · Estúdio 6 SP com controle ION",
    praca: "SP",
    estudio: "6 SP",
    controle: "ION",
    apelidos: ["câmeras sp", "narração sp"],
    video: {
      nos: ["COT SP", "COT ION", "CTL ION", "EXIBE"],
      links: [
        {
          ida: ["CAMERA 1 | PR RX SP-1", "CAMERA 2 | PR RX SP-2", "CAMERA 3 | PR RX SP-3"],
          volta: [
            "DIRETO TIT | PR TX LAWO E DR LAWO",
            "AUX TELÃO | PR TX LAWO E DR LAWO",
            "PGM COM CTL | PR TX LAWO E DR LAWO",
          ],
        },
        {
          ida: ["CAMERA 1", "CAMERA 2", "CAMERA 3", "DIRETO TIT", "DIRETO BY"],
          volta: ["AUX TELÃO"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT SP", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["MIC BY | DIRECT", "OVER | DIRECT", "+ASS SP | PARTYLINE", "+CAM SP | PARTYLINE"],
          volta: ["MINUS | DIRECT"],
        },
        {
          ida: ["MIC BY | REMOTE", "OVER | IFB EVNT", "+CAM SP", "+ASS SP"],
          volta: ["MINUS | AUX AUD"],
        },
      ],
    },
    canais: [{ titulo: "Câmeras 1, 2 e 3 SP", canais: NARRA_COMENTA }, ...CANAIS_PADRAO],
  },
  {
    id: "ion-sp-cabine",
    pagina: 2,
    titulo: "ION x SP",
    nome: "SP · Cabine SP com controle ION",
    praca: "SP",
    estudio: "CAB SP",
    controle: "ION",
    apelidos: ["cabine", "locução sp"],
    video: {
      nos: ["COT SP", "COT ION", "CTL ION", "EXIBE"],
      links: [
        {
          ida: ["CABINE TIT | LAWO", "CABINE BY | LAWO"],
          volta: ["DIRETO | LAWO", "PGM COM CTL | LAWO"],
        },
        { ida: ["DIRETO TIT", "DIRETO BY", "CABINE TIT", "CABINE BY"], volta: [] },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT SP", "COT ION", "CTL ION"],
      links: [
        { ida: ["~MIC BY | DIRECT", "OVER | DIRECT", "+CAB SP | PARTYLINE"], volta: ["MINUS | DIRECT"] },
        { ida: ["~MIC BY | REMOTE", "OVER | IFB EVNT", "+CAB SP"], volta: ["MINUS | AUX AUD"] },
      ],
    },
    canais: [
      { titulo: "Cabine TIT", canais: ["LAPELA + MD NARRA", "LAPELA + MD COMENTA", "", ""] },
      {
        titulo: "Cabine BY",
        destaque: true,
        canais: ["MIX MD NARRA / COMENTA", "MIX MD NARRA / COMENTA", "", ""],
      },
      ...CANAIS_PADRAO,
    ],
  },
  {
    id: "ion-sp-6sp-ctl-2sp",
    pagina: 3,
    titulo: "ION x SP",
    nome: "SP · Estúdio 6 SP com controle 2 SP",
    praca: "SP",
    estudio: "6 SP",
    controle: "2 SP",
    apelidos: ["controle sp", "pgm sem sono"],
    video: {
      nos: ["CTL SP", "COT SP", "COT ION", "EXIBE"],
      links: [
        { ida: ["PGM TIT", "PGM BY", "PGM SEM SONO"], volta: ["DIRETO TIT", "DIRETO BY"] },
        {
          ida: ["PGM TIT | LAWO", "PGM BY | LAWO", "PGM SEM SONO | LAWO", "PGM TIT VIA DR | NIMBRA DR LAWO"],
          volta: ["DIRETO | LAWO"],
        },
        SAIDA_PROC,
      ],
    },
    audio: {
      nos: ["CTL SP", "COT SP", "COT ION", "EXIBE"],
      links: [
        { ida: [], volta: ["+MST SP", "+CRD SP"] },
        { ida: ["+MST SP | PARTYLINE", "+CRD SP | PARTYLINE"], volta: [] },
        { ida: ["+MST SP"], volta: [] },
      ],
    },
    canais: [
      { titulo: "PGM TIT", canais: MIX_COM },
      { titulo: "PGM BY", canais: MIX_SEM },
      { titulo: "PGM Sem sono", canais: ["VOZ", "AMBIENTE MONO"] },
    ],
  },
  {
    id: "ion-sp-pc5-ctl-2sp",
    pagina: 4,
    titulo: "ION x SP",
    nome: "SP · Estúdio PC5/CAB com controle 2 SP",
    praca: "SP",
    estudio: "PC5/CAB",
    controle: "2 SP",
    apelidos: ["poncap 5", "cabine ion", "cam est ion"],
    video: {
      nos: ["CTL SP", "COT SP", "COT ION", "EXIBE"],
      links: [
        { ida: ["PGM TIT", "PGM BY", "PGM SEM SONO"], volta: ["DIRETO TIT", "DIRETO BY", "CAM EST ION"] },
        {
          ida: ["PGM TIT | LAWO", "PGM BY | LAWO", "PGM SEM SONO | LAWO", "PGM TIT VIA DR | NIMBRA DR LAWO"],
          volta: ["DIRETO", "CAM EST ION"],
        },
        SAIDA_PROC,
      ],
    },
    audio: {
      nos: ["CTL SP", "COT SP", "COT ION", "EXIBE"],
      links: [
        { ida: ["MINUS"], volta: ["+MST SP", "+CRD SP", "MIC BY", "OVER"] },
        {
          ida: ["+MST SP | PARTYLINE", "+CRD SP | PARTYLINE", "MINUS | DIRECT"],
          volta: ["MIC BY | DIRECT", "OVER | DIRECT"],
        },
        { ida: ["+MST SP"], volta: [] },
      ],
    },
    canais: [
      { titulo: "PONCAP 5", destaque: true, canais: NARRA_COMENTA },
      { titulo: "Cabine ION", destaque: true, canais: NARRA_COMENTA },
      { titulo: "PGM TIT", canais: MIX_COM },
      { titulo: "PGM BY", canais: MIX_SEM },
      { titulo: "PGM Sem sono", canais: ["VOZ", "AMBIENTE MONO"] },
    ],
  },
  {
    id: "ion-bhe-on-tube",
    pagina: 5,
    titulo: "ION x BHE",
    nome: "BHE · Estúdio BHE On Tube com controle ION",
    praca: "BHE",
    estudio: "BHE ON TUBE",
    controle: "ION",
    apelidos: ["minas", "bh", "metrolan", "tvu"],
    video: {
      nos: ["COT BHE", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CABINE TIT | METROLAN", "CABINE BY | TVU"],
          volta: ["DIRETO | METROLAN", "AUX TELÃO | METROLAN", "CTL COM | METROLAN"],
        },
        {
          ida: ["CABINE TIT", "CABINE BY", "DIRETO TIT | + DELAY COERÊNCIA", "DIRETO BY | + DELAY COERÊNCIA"],
          volta: ["AUX TELÃO"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT BHE", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["MIC BY | DIRECT", "OVER | DIRECT / ACCESS", "ASS/DTV | DIRECT"],
          volta: ["MINUS | DIRECT / ACCESS"],
        },
        { ida: ["MIC BY | REMOTE CONTROLE", "OVER | IFB", "ASS/DTV | IFB"], volta: ["MINUS"] },
      ],
    },
    canais: [
      {
        titulo: "Cabine TIT",
        canais: ["LAPELA 1", "LAPELA 2", "LAPELA 3", "MD 1", "MD 2", "MD 3", "MIX MICs", "OVER"],
      },
      ...CANAIS_PADRAO,
    ],
  },
  {
    id: "ion-bhe-diamantina",
    pagina: 6,
    titulo: "ION x BHE",
    nome: "BHE · Estúdio Diamantina com controle ION",
    praca: "BHE",
    estudio: "DIAMANTINA BHE",
    controle: "ION",
    apelidos: ["minas", "bh", "diamantina", "dtv camera"],
    video: {
      nos: ["COT BHE", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CABINE TIT | METROLAN", "CABINE BY | TVU"],
          volta: ["DIRETO | METROLAN", "CTL COM | METROLAN"],
        },
        {
          ida: ["CABINE TIT", "CABINE BY", "DIRETO TIT | + DELAY COERÊNCIA", "DIRETO BY | + DELAY COERÊNCIA"],
          volta: [],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT BHE", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["MIC BY | DIRECT", "OVER | DIRECT / ACCESS", "AUDIO | DIRECT"],
          volta: ["DTV/CAMERA | DIRECT", "MINUS | DIRECT / ACCESS"],
        },
        {
          ida: ["MIC BY | REMOTE CONTROLE", "OVER | IFB", "AUDIO | DIRECT"],
          volta: ["DTV/CAMERA | DIRECT", "MINUS"],
        },
      ],
    },
    canais: [
      {
        titulo: "Cabine TIT",
        canais: ["LAPELA 1", "LAPELA 2", "LAPELA 3", "MD 1", "MD 2", "MD 3", "", "OVER"],
      },
      ...CANAIS_PADRAO,
    ],
  },
  {
    id: "ion-bhe-ctl-bhe",
    pagina: 7,
    titulo: "ION x BHE",
    nome: "BHE · Estúdio BHE com controle BHE",
    praca: "BHE",
    estudio: "BHE",
    controle: "BHE",
    apelidos: ["minas", "bh", "mestre", "gol"],
    video: {
      nos: ["CTL BHE", "COT BHE", "COT ION", "EXIB"],
      links: [
        { ida: ["PGM TIT", "PGM BY", "PGM SEM SONO"], volta: ["DIRETO TIT", "DIRETO BY"] },
        {
          ida: ["PGM TIT | METROLAN", "PGM BY | METROLAN", "PGM TIT VIA DR | TVU", "PGM SEM SONO | METROLAN"],
          volta: ["DIRETO | METROLAN"],
        },
        SAIDA_PROC,
      ],
    },
    audio: {
      nos: ["CTL BHE", "COT BHE", "COT ION", "EXIBE"],
      links: [
        { ida: [], volta: ["MESTRE", "CORD", "GOL"] },
        { ida: ["MESTRE | SORT GROUP", "CORD | DIRECT", "GOL | DIRECT"], volta: [] },
        { ida: ["MESTRE | IFB EVENTUAL"], volta: [] },
      ],
    },
    canais: [
      {
        titulo: "PGM Produzido",
        canais: [...MIX_COM, "", "", "MIX COM FOGUETE", "MIX COM FOGUETE"],
      },
      {
        titulo: "PGM Limpo",
        canais: ["MUX PROD", "AMB MONO", "MUX PROD", "AMB MONO", "MUX PROD", "AMB MONO", "MUX PROD", "AMB MONO"],
      },
    ],
  },
  {
    id: "ion-g3",
    pagina: 8,
    titulo: "ION x G3",
    nome: "G3 · Estúdio PC5/CAB com controles externos",
    praca: "G3",
    estudio: "PC5/CAB",
    controle: "Controles externos",
    emConstrucao: true,
    apelidos: ["poncap", "cabine de locução", "cam espia"],
    video: {
      nos: ["CTL G3", "COT G3", "COT ION", "PC5/CAB"],
      links: [
        { ida: [], volta: ["CAM PC5 ION", "CAM ESPIA"] },
        { ida: ["PGM TIT", "DIRETO"], volta: ["CAM PC5 ION", "CAM ESPIA"] },
        { ida: ["PGM TIT", "DIRETO"], volta: ["CAM PC5 ION", "CAM ESPIA"] },
      ],
    },
    audio: {
      nos: ["CTL G3", "COT G3", "COT ION", "PC5/CAB"],
      links: [
        { ida: ["MINUS"], volta: ["MIC BY", "OVER"] },
        { ida: ["MINUS | DIRECT"], volta: ["MIC BY | DIRECT", "OVER | DIRECT"] },
        { ida: ["MINUS"], volta: ["MIC BY", "OVER"] },
      ],
    },
    canais: [
      { titulo: "PONCAP 5", destaque: true, canais: NARRA_COMENTA },
      { titulo: "PONCAP 1-4", destaque: true, canais: NARRA_COMENTA },
      { titulo: "Cabine de locução", destaque: true, canais: NARRA_COMENTA },
    ],
  },
  {
    id: "ion-rce",
    pagina: 9,
    titulo: "ION x RCE",
    nome: "RCE · Estúdio RCE com controle ION",
    praca: "RCE",
    estudio: "RCE",
    controle: "ION",
    apelidos: ["pernambuco", "metrolan", "tvu"],
    video: {
      nos: ["COT RCE", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CABINE TIT | METROLAN", "CABINE BY | TVU"],
          volta: ["DIRETO | METROLAN", "AUX TELÃO | METROLAN/LAWO", "CTL COM | METROLAN/LAWO"],
        },
        {
          ida: ["CABINE TIT", "CABINE BY", "DIRETO TIT | + DELAY COERÊNCIA", "DIRETO BY | + DELAY COERÊNCIA"],
          volta: ["AUX TELÃO | AUX CONTROLE"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT RCE", "COT ION", "CTL ION"],
      links: [
        { ida: ["MIC BY | DIRECT", "OVER | DIRECT", "DTV/CAMERA | DIRECT"], volta: ["MINUS | DIRECT / ACCESS"] },
        {
          ida: ["MIC BY | REM CONTROLE", "OVER | IFB EVENT", "DTV/CAMERA | IFB"],
          volta: ["MINUS | AUX CONTROLE"],
        },
      ],
    },
    canais: [
      {
        titulo: "Cabine TIT",
        canais: ["LAPELA 1", "LAPELA 2", "LAPELA 3", "MD 1", "MD 2", "MD 3", "MIX MICs", "OVER"],
      },
      ...CANAIS_PADRAO,
    ],
  },
  {
    id: "ion-rce-ponto-captacao",
    pagina: 10,
    titulo: "ION x RCE",
    nome: "RCE · Ponto de captação com controle ION",
    praca: "RCE",
    estudio: "PONTO CAPTAÇÃO",
    controle: "ION",
    apelidos: ["pernambuco", "externa", "metrolan"],
    video: {
      nos: ["COT RCE", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CABINE TIT | METROLAN", "CABINE BY | TVU"],
          volta: ["DIRETO | METROLAN", "AUX TELÃO | METROLAN/LAWO", "CTL COM | METROLAN/LAWO"],
        },
        {
          ida: ["CABINE TIT", "CABINE BY", "DIRETO TIT | + DELAY COERÊNCIA", "DIRETO BY | + DELAY COERÊNCIA"],
          volta: ["AUX TELÃO | AUX CONTROLE"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT RCE", "COT ION", "CTL ION"],
      links: [
        { ida: ["MIC BY | DIRECT", "OVER | DIRECT", "DTV/CAMERA | DIRECT"], volta: ["MINUS | DIRECT / ACCESS"] },
        {
          ida: ["MIC BY | REM CONTROLE", "OVER | IFB EVENT", "DTV/CAMERA | IFB"],
          volta: ["MINUS | AUX CONTROLE"],
        },
      ],
    },
    canais: [
      { titulo: "Cabine TIT", canais: [...NARRA_COMENTA, "", "", "", "OVER"] },
      ...CANAIS_PADRAO,
    ],
  },
  {
    id: "ion-rce-ctl-rce",
    pagina: 11,
    titulo: "ION x RCE",
    nome: "RCE · Estúdio RCE com controle RCE",
    praca: "RCE",
    estudio: "RCE",
    controle: "RCE",
    apelidos: ["pernambuco", "mestre", "metrolan via jb"],
    video: {
      nos: ["CTL RCE", "COT RCE", "COT ION", "EXIB"],
      links: [
        { ida: ["PGM TIT", "PGM BY", "PGM SEM SONO"], volta: ["DIRETO TIT", "DIRETO BY"] },
        {
          ida: ["PGM TIT | METROLAN", "PGM BY | TVU", "PGM SEM SONO | METROLAN VIA JB"],
          volta: ["DIRETO | METROLAN"],
        },
        { ida: ["PROC PGM TIT | REM/PROC", "PROC PGM BY | REM/PROC", "^PGM LIMPO"], volta: [] },
      ],
    },
    audio: {
      nos: ["CTL RCE", "COT RCE", "COT ION", "EXIBE"],
      links: [
        { ida: [], volta: ["MESTRE", "CORD"] },
        { ida: ["MESTRE | DIRECT", "CORD | DIRECT"], volta: [] },
        { ida: ["MESTRE | IFB EVENTUAL"], volta: [] },
      ],
    },
    canais: [
      { titulo: "PGM Produzido", canais: MIX_COM },
      { titulo: "PGM Limpo", canais: ["", ""] },
    ],
  },
  {
    id: "ion-jb-jungle-fight",
    pagina: 12,
    titulo: "ION x JB (Jungle Fight)",
    nome: "JB · Jungle Fight com controle ION",
    praca: "JB",
    estudio: "JB",
    controle: "ION",
    apelidos: ["jungle", "mma", "luta", "rio"],
    video: {
      nos: ["COT JB", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CAMERA 1 | PR RX 09", "CAMERA 2 | PR RX", "CAMERA 3 | PR RX", "CAMERA 4 | PR RX"],
          volta: ["AUX TELÃO | PR TX LAWO", "PGM COM CTL | PR TX LAWO"],
        },
        {
          ida: ["CAMERA 1", "CAMERA 2", "CAMERA 3", "CAMERA 4", "DIRETO TIT", "DIRETO BY"],
          volta: ["AUX TELÃO"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT JB", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["OVER | DIRECT", "+CAM-GE | PARTYLINE", "+ILUM-GE | PARTYLINE", "+COORD²I | PARTYLINE"],
          volta: ["MUX AUX TELÃO* | MxCOM", "PONTO 1 | DIRECT", "PONTO 2 | DIRECT", "MINUS | DIRECT"],
        },
        {
          ida: ["OVER | REMOTE/IFB", "+CAM-GE | PARTYLINE", "+ILUM-GE | PARTYLINE", "+COORD²I | PARTYLINE"],
          volta: ["FOLDBACK | AUX AUD", "TALKBACK | AUX AUD", "MINUS | AUX AUD"],
        },
      ],
    },
    canais: CANAIS_PADRAO,
    notas: [NOTA_TALKBACK],
  },
  {
    id: "ion-jb-getv",
    pagina: 13,
    titulo: "ION x JB (GETV)",
    nome: "JB · GE TV com controle ION",
    praca: "JB",
    estudio: "JB",
    controle: "ION",
    apelidos: ["ge tv", "getv", "react", "rio", "dmux"],
    video: {
      nos: ["COT JB", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: [
            "CAMERA 1 | TX17 JB1 (EDC TELÃO 1B)",
            "CAMERA 2 | TX18 JB1 (EDC REGR PO)",
            "CAMERA 3 | TX19 JB1 (GS HS TOUCH)",
            "CAMERA 4 | TX20 JB1 (PR TX EG/ION-3)",
            "CAM DR | JB-1",
          ],
          volta: ["DIRETO | IP PR TX ION 1", "PGM COM CTL | IP PR TX ION 2"],
        },
        {
          ida: [
            "CAMERA 1 | DMUX-9",
            "CAMERA 2 | DMUX-10",
            "CAMERA 3 | DMUX-11",
            "CAMERA 4 | DMUX-12",
            "CAM DR",
            "TVU CORD",
            "DIRETO TIT",
            "DIRETO BY",
          ],
          volta: ["REACT | AUXILIAR + ÁUDIO PGM"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT JB", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["", "ION_GE_TP 1 | PAINEL", "OP_R0604_C | PAINEL"],
          volta: ["PONTO 1 | DIRECT", "PONTO 2 | DIRECT", "MINUS | DIRECT"],
        },
        {
          ida: ["VIVO CRD | IFB GE TV VOZ", "ION_GE_TP 1 | PAINEL", "OP_R0604_C | PAINEL"],
          volta: ["PONTO 1 | REMOTE", "PONTO 2 | REMOTE", "VIVO CORD | REMOTE"],
        },
      ],
    },
    canais: CANAIS_PADRAO,
  },
  {
    id: "ion-sp-getv",
    pagina: 14,
    titulo: "ION x SP (GE TV)",
    nome: "SP · GE TV no Estúdio 6 SP com controle ION",
    praca: "SP",
    estudio: "6 SP",
    controle: "ION",
    apelidos: ["ge tv", "getv", "react", "vivo cord"],
    video: {
      nos: ["COT SP", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CAMERA 1 | PR RX SP-1", "CAMERA 2 | PR RX SP-2", "CAMERA 3 | PR RX SP-3", "CAM 2 DR | CAM 1 SP"],
          volta: ["PGM COM CTL | PR TX LAWO E DR LAWO"],
        },
        {
          ida: ["CAMERA 1", "CAMERA 2", "CAMERA 3", "CAM 2 DR", "TVU CORD", "DIRETO TIT", "DIRETO BY"],
          volta: ["REACT | AUXILIAR + ÁUDIO PGM"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT SP", "COT ION", "CTL ION"],
      links: [
        {
          ida: [
            "MIC BY | DIRECT",
            "OVER | DIRECT",
            "+ASS SP | PARTYLINE",
            "+CAM SP | PARTYLINE",
            "+CRD SPION | PARTYLINE",
          ],
          volta: ["MINUS | DIRECT"],
        },
        {
          ida: [
            "MIC BY | REMOTE",
            "OVER | IFB EVNT",
            "+CAM SP | PARTYLINE",
            "+ASS SP | PARTYLINE",
            "+CRD SPION | PARTYLINE",
            "VIVO CORD | IFB GE TV VOZ",
          ],
          volta: ["MINUS | AUX AUD"],
        },
      ],
    },
    canais: [{ titulo: "Câmeras 1, 2 e 3 SP", canais: NARRA_COMENTA }, ...CANAIS_PADRAO],
  },
  {
    id: "ion-jb-jungle-d2",
    pagina: 15,
    titulo: "ION x JB (Jungle alterado pelo D2)",
    nome: "JB · Jungle Fight (versão alterada pelo D2)",
    praca: "JB",
    estudio: "JB",
    controle: "ION",
    apelidos: ["jungle", "mma", "luta", "d2", "rio", "dmx"],
    video: {
      nos: ["!COT JB", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CAMERA 1 | PR RX 09", "CAMERA 2 | PR RX 10", "CAMERA 3 | PR RX 11", "CAMERA 4 | PR RX 12"],
          volta: ["MUX TELÃO | PR TX 1 LAWO", "PGM COM CTL | PR TX LAWO"],
        },
        {
          ida: ["CAMERA 1 | DMX 6", "CAMERA 2 | DMX 7", "CAMERA 3 | DMX 8", "CAMERA 4 | DMX 9", "DIRETO BY", "DIRETO BY"],
          volta: ["AUX TELÃO"],
        },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["!COT JB", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["OVER | DIRECT", "PRE PT1 | DIRECT", "PRE PT2 | DIRECT", "+CAM-GE | PARTYLINE"],
          volta: ["MUX AUX TELÃO* | MxCOM", "CRD PT1 | DIRECT", "CRD PT2 | DIRECT", "MINUS | DIRECT"],
        },
        {
          ida: ["OVER | REMOTE/IFB", "+CAM-GE | PARTYLINE"],
          volta: ["FOLDBACK | AUX AUD", "TALKBACK | AUX AUD", "MINUS | AUX AUD"],
        },
      ],
    },
    canais: [
      { titulo: "PGM Comercializado", canais: MIX_COM },
      { titulo: "PGM Produzido", canais: MIX_SEM },
      { titulo: "PGM Limpo", destaque: true, canais: PGM_LIMPO_8 },
    ],
    notas: [NOTA_TALKBACK],
  },
  {
    id: "ion-site-tvg",
    pagina: 16,
    titulo: "ION x Site TVG",
    nome: "TVG · Site TVG (gravação de praças externas)",
    praca: "TVG",
    estudio: "JB / SP / RCE / BHE",
    controle: "JB / SP / RCE / BHE",
    modelo: "TVG",
    apelidos: ["site", "gravar", "cot ext", "externo"],
    video: {
      nos: ["COT EXT", "COT ION", "^GRAVAR"],
      links: [
        { ida: ["PGM PROD", "PGM LIMPO SEM SONO"], volta: ["DIRETO | LAWO"] },
        { ida: ["DIRETO", "PGM PROD", "PGM LIMPO SEM SONO"], volta: [] },
      ],
    },
    audio: {
      nos: ["COT EXT", "COT ION"],
      links: [{ ida: ["CORD | DIRECT"], volta: ["MINUS | DIRECT"] }],
    },
    canais: [
      { titulo: "PGM Produzido", canais: MIX_SEM },
      { titulo: "PGM Limpo", canais: PGM_LIMPO_8 },
    ],
    notas: [NOTA_TALKBACK],
  },
  {
    id: "ion-eg-mg3-b-ion",
    pagina: 17,
    titulo: "ION x EG",
    nome: "EG · Estúdio MG3 com controle B ION",
    praca: "EG",
    estudio: "MG3",
    controle: "B ION",
    apelidos: ["estúdios globo", "porchat", "camera x", "mvw"],
    video: {
      nos: ["COT EG", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CAMERA X | PR RX", "CAMERA X | PR RX", "CAMERA X | PR RX", "CAM DR | MW DR"],
          volta: ["PGM AR | PR TX LAWO", "AUX TELÃO | PR TX LAWO", "MVW AUDIO CTL | PR TX LAWO"],
        },
        { ida: ["CAMERA X", "CAMERA X", "CAMERA X", "CAMERA DR", "", ""], volta: ["AUX TELÃO"] },
        SAIDA_CTL_ION,
      ],
    },
    audio: {
      nos: ["COT EG", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["+CAM EG | DIRECT", "+PROD EG | DIRECT", "+ILUM EG | DIRECT", "+AUD EG | DIRECT"],
          volta: [
            "TALK EG | LQ FECHADO VIA DIRECT",
            "PONTO 1 | LQ FECHADO VIA DIRECT",
            "PONTO 2 | LQ FECHADO VIA DIRECT",
            "PONTO 3 | LQ FECHADO VIA DIRECT",
          ],
        },
        {
          ida: ["+CAM EG | IFB", "+PROD EG | IFB", "+ILUM EG | IFB", "+AUD EG | IFB"],
          volta: ["TALKBACK | AUX AUD"],
        },
      ],
    },
    canais: [
      { titulo: "Camera X", destaque: true, canais: ["", "", "", ""] },
      { titulo: "Camera DR", destaque: true, canais: ["", "", "", ""] },
      { titulo: "PGM TIT", canais: ["MIX L", "MIX R", "MIX L", "MIX R"] },
      { titulo: "PGM BY", canais: ["MIX L", "MIX R", "MIX L", "MIX R"] },
      { titulo: "PGM Limpo", destaque: true, canais: Array(8).fill("") },
    ],
  },
  {
    id: "ion-eg-web",
    pagina: 18,
    titulo: "ION x EG (web)",
    nome: "EG · Web com controle EG",
    praca: "EG",
    estudio: "EG",
    controle: "EG",
    station: "MSW / GNT / TVG entretenimento",
    apelidos: ["estúdios globo", "web", "pvw web", "gnt", "msw", "entretenimento"],
    video: {
      nos: ["COT EG", "COT ION", "EXIB"],
      links: [
        { ida: ["PGM TIT | PR RX", "PGM BY | PR RX", "PGM DR | MW DR"], volta: [] },
        { ida: ["PGM TIT | REMOTE", "PGM BY | REMOTE", "PGM DR | REMOTE"], volta: [] },
      ],
    },
    audio: {
      nos: ["COT EG", "COT ION"],
      links: [{ ida: ["PVW WEB | PAINEL"], volta: ["PVW WEB | PAINEL"] }],
    },
    canais: [{ titulo: "PGM Produzido", canais: ["MIX", "MIX", "MIX", "MIX"] }],
  },
  {
    id: "ion-eg-mg3-ion",
    pagina: 19,
    titulo: "ION x EG",
    nome: "EG · Estúdio MG3 com controle ION",
    praca: "EG",
    estudio: "MG3",
    controle: "ION",
    station: "MSW / GNT / TVG entretenimento",
    apelidos: ["estúdios globo", "porchat", "mvw", "gnt", "msw", "entretenimento"],
    video: {
      nos: ["COT EG", "COT ION", "CTL ION", "EXIB"],
      links: [
        {
          ida: ["CAMERA 1 | PR RX", "CAMERA 2 | PR RX", "CAMERA X | PR RX", "CAM DR* | MW DR"],
          volta: ["PGM COM | PR TX", "PGM LIMPO | PR TX", "MVW AUDIO CTL | PR TX"],
        },
        { ida: ["CAMERA 1", "CAMERA 2", "CAMERA 3", "CAMERA DR", "", ""], volta: ["AUX TELÃO"] },
        { ida: ["PGM PROD", "^PGM LIMPO"], volta: [] },
      ],
    },
    audio: {
      nos: ["COT EG", "COT ION", "CTL ION"],
      links: [
        {
          ida: ["+CAM EG | PARTYLINE", "+PROD EG | PARTYLINE", "+ILUM EG | PARTYLINE", "+AUD EG | PARTYLINE"],
          volta: ["TALK EG | DIRECT/LQ", "PONTO 1 | DIRECT/LQ", "PONTO 2 | DIRECT/LQ", "PONTO 3 | DIRECT/LQ"],
        },
        {
          ida: ["+CAM EG | PARTYLINE", "+PROD EG | PARTYLINE", "+ILUM EG | PARTYLINE", "+AUD EG | PARTYLINE"],
          volta: ["TALKBACK | AUX AUD"],
        },
      ],
    },
    canais: [
      { titulo: "PGM Produzido", canais: ["MIX", "MIX", "MIX", "MIX"] },
      { titulo: "PGM Limpo", canais: ["MIX", "MIX", "MIX", "MIX"] },
    ],
    notas: ["*MICs DR no vídeo da câmera DR."],
  },
];

/** Converte a string compacta de um sinal em objeto. */
export function parseSinal(raw) {
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
