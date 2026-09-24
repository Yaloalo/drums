const CACHE = 'pulse-foundry-v3';
// The production postbuild step injects every bundled JS/CSS/font asset here.
const PRECACHE = [];
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...SHELL, ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('pulse-foundry-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__debug')) return;
  // Never cache Vite's mutable development modules. A cached component paired
  // with a newer dependency can otherwise fail with missing named exports.
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/.vite/') ||
    url.searchParams.has('t')
  ) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put('/', copy)); return response;
    }).catch(() => caches.match('/')));
    return;
  }
  const cacheFirst = PRECACHE.includes(url.pathname) || SHELL.includes(url.pathname);
  if (cacheFirst) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request)));
});
