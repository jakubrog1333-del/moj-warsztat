// Cache wyłącznie plików aplikacji. Brak cache danych klientów / Supabase / Google.
const CACHE = 'moj-warsztat-shell-v1';
const ASSETS = ['./','./index.html','./style.css','./app.js','./helpers.js','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('config.js')) return;
  // Wyłącznie publiczne statyczne pliki z tego samego katalogu.
  const path = url.pathname.split('/').pop();
  if (!['','index.html','style.css','app.js','helpers.js','icon-192.png','icon-512.png','manifest.webmanifest'].includes(path)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
