const CACHE_NAME = 'redeemer-family-portal-v1';
const SHELL = ['/', '/portal', '/redeemer-portal.webmanifest', '/redeemer-seal.svg?v=2'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    const response = await cache.match('/');
    const html = response ? await response.text() : '';
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
    await Promise.all(assets.map(asset => cache.add(asset).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('redeemer-family-portal-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then(cache => cache.put(url.pathname === '/portal' ? '/portal' : '/', copy));
      return response;
    }).catch(async () => (await caches.match(url.pathname === '/portal' ? '/portal' : '/')) || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
