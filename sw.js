// Service worker : met l'appli en cache pour qu'elle s'ouvre sans réseau (en bateau, en voyage…).
//
// IMPORTANT : à chaque modification d'un fichier de l'appli, augmente VERSION
// pour que les téléphones récupèrent la nouvelle version.
const VERSION = "recif-v1.0.1";

const FICHIERS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/app.js",
  "js/config.js",
  "js/db.js",
  "js/especes.js",
  "js/ui.js",
  "js/vues/carnet.js",
  "js/vues/especes.js",
  "js/vues/quiz.js",
  "js/vues/reglages.js",
  "data/species.json",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/bricolage-grotesque-latin-500-normal.woff2",
  "fonts/bricolage-grotesque-latin-800-normal.woff2",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// Installation : on télécharge tous les fichiers de l'appli.
self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

// Activation : on supprime les caches des anciennes versions.
self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Requêtes : les fichiers de l'appli viennent du cache. Le reste (photos, API) passe
// par le réseau normalement ; les photos hors-ligne sont gérées dans IndexedDB.
self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET" || url.origin !== location.origin) return;
  ev.respondWith(
    caches.match(ev.request, { ignoreSearch: true }).then((r) => r || fetch(ev.request))
  );
});
