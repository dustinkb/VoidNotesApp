const CACHE_NAME = 'void-notes-cache-v4';

self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  const assetsToCache = [
    scope,
    new URL('index.html', scope).href,
    new URL('manifest.json', scope).href,
    new URL('icon-192X192.png', scope).href,
    new URL('icon-512x512.png', scope).href
  ];

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(assetsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Never cache API routes
  if (requestUrl.pathname.includes('/api/')) {
    return;
  }

  const scope = self.registration.scope;
  const appShellUrl = new URL('index.html', scope).href;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseToCache = response.clone();
          void caches.open(CACHE_NAME).then((cache) => {
            cache.put(appShellUrl, responseToCache);
          });
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(appShellUrl);
          return cachedResponse || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        void caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
