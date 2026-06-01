const CACHE = 'gb-v10';
const ASSETS = [
  './',
  './index.html',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  // manifest.json intentionally excluded — must be fetched fresh so theme_color
  // and other install-time metadata always reflect the latest deployed version
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navigation (the HTML document): NETWORK-FIRST so a fresh deploy shows up immediately —
  // no more manual cache-version bumps to ship index.html changes. Falls back to the cached
  // shell only when offline. We normalize the cache key to './index.html' so the precached
  // entry and the offline fallback always line up regardless of the requested URL ('/' vs '/index.html').
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok && isSameOrigin) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put('./index.html', clone));
        }
        return response;
      }).catch(() => caches.match('./index.html').then(c => c || caches.match('./')))
    );
    return;
  }

  // Everything else (icons / static same-origin assets, cross-origin fonts): CACHE-FIRST for
  // speed + offline, filling the cache on a miss. Cross-origin misses just hit the network.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && isSameOrigin) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => undefined);
    })
  );
});
