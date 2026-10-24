// Service worker: deixa o app abrindo offline depois da primeira visita.
// Ao alterar arquivos do app, incremente VERSION para forçar a atualização.
const VERSION = "v2";
const CACHE = `central-eventos-${VERSION}`;

const SHELL = [
  "./",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/data.js",
  "js/search.js",
  "data/eventos.json",
  "manifest.webmanifest",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/favicon.png",
  "assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (dados sempre atualizados quando online), cache como reserva.
// As imagens dos diagramas originais são guardadas conforme forem abertas.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
