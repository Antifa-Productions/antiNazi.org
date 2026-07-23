const CACHE_NAME = 'simple-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache opened');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim()
  );
});

self.addEventListener('fetch', (event) => {
  // Just pass through for now — no caching logic yet
  // If we get here, the SW is functioning
  event.respondWith(fetch(event.request));
});

// Health check endpoint
self.addEventListener('message', (event) => {
  if (event.data === 'PING') {
    event.ports[0].postMessage('PONG');
  }
});
