// Offline-first app shell.
// System Requirement doc: "consider an 'offline-first' design ... so customers
// can browse ... even without an internet connection."
//
// Strategy:
//  - App shell (HTML/CSS/JS/icons): cache-first so the app loads offline.
//  - API GETs: network-first, falling back to the last cached response.
//  - API writes (POST/etc): never cached; surfaced to the user as offline.
const SHELL = 'ega-shell-v2';
const DATA = 'ega-data-v2';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/views/auth.js',
  '/js/views/home.js',
  '/js/views/catalog.js',
  '/js/views/requests.js',
  '/js/views/approvals.js',
  '/js/views/admin.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET') return; // never cache writes

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API reads, fall back to cache when offline.
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for the app shell.
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
