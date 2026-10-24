const CACHE_NAME = 'redeemer-family-portal-v2';
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

self.addEventListener('push', event => {
  let message = { title: 'Redeemer School', body: 'You have a new school update.', url: '/portal' };
  try { if (event.data) message = { ...message, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(String(message.title || 'Redeemer School'), {
    body: String(message.body || 'You have a new school update.'),
    icon: '/redeemer-seal.svg',
    badge: '/redeemer-seal.svg',
    data: { url: typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/portal' },
    tag: 'redeemer-school-update',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/portal';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); if ('navigate' in existing) await existing.navigate(target); return; }
    await self.clients.openWindow(target);
  }));
});
