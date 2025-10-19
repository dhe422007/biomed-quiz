/* sw.js v15.2 — network-first for HTML, cache-first for assets, and do NOT cache GA */
const CACHE_NAME = 'biomed-quiz-v15.2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './questions.json',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

// Never cache analytics calls
const GA_HOSTS = ['www.google-analytics.com', 'www.googletagmanager.com', 'analytics.google.com'];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (GA_HOSTS.includes(url.hostname)) {
    return; // let the network handle GA
  }

  // HTML => network-first (so index.html/app changes are always picked)
  if (event.request.mode === 'navigate' || (event.request.destination === 'document')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request) || await cache.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Others (JS/CSS/img) => cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      cache.put(event.request, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
