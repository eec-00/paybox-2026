const CACHE_NAME = 'paybox-v2';
const STATIC_ASSETS = [
  '/logo.png',
  '/login.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore errors for individual assets
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Helper: detect HTML navigation requests (pages with auth checks)
function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) return;

  // Skip API routes — always fetch fresh
  if (event.request.url.includes('/api/')) return;

  // Never cache HTML navigation requests — they contain auth redirects
  // that must always hit the server to be valid
  if (isNavigationRequest(event.request)) return;

  // Skip Next.js RSC (React Server Component) requests
  if (event.request.url.includes('_rsc') || event.request.headers.get('rsc')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Only cache valid static asset responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
