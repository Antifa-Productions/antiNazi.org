const FILE_LIST_URL = 'file-list.json';
const STATIC_CACHE_PREFIX = 'static-separate-list-v';

// Immediately be ready to control the page
self.skipWaiting();

self.addEventListener('install', event => {
    event.waitUntil(
        updateCheck().catch(error => {
            console.warn('Installation cache update failed:', error);
            // Continue installation despite cache update failure
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            // Clean up old static caches
            const keys = await caches.keys();
            const latestCache = getLatestCacheName(keys);
            await Promise.all(
                keys
                  .filter(name => name.startsWith(STATIC_CACHE_PREFIX) && name !== latestCache)
                  .map(name => caches.delete(name))
            );
            await self.clients.claim();
        })()
    );
});

// Main fetch handler - stale-while-revalidate for navigations, cache-first for static, network fallback
self.addEventListener('fetch', event => {
    const {request} = event;

    // Serve static assets (js/css/fonts/images) cache-first
    if (isStaticAsset(request.url)) {
        event.respondWith(
            caches.match(request).then(resp => resp || fetch(request))
        );
        return;
    }

    // Serve navigation requests: stale-while-revalidate
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                const cacheName = await getCurrentStaticCache();
                const cachedResponse = await serveFromCacheOrNull(cacheName, request);
                // Start cache update in background
                event.waitUntil(updateCheck().catch(err => console.warn('Background update check failed:', err)));
                return cachedResponse || fetch(request).catch(() =>
                    caches.match('/offline.html') // Optional: requires you to cache offline.html
                );
            })()
        );
        return;
    }

    // Default: handle with custom handler
    event.respondWith(handleFetchRequest(event));
});

async function fetchAndBust(request) {
    const req = typeof request === 'string' ? new Request(request) : request;
    const url = new URL(req.url);
    url.searchParams.append('_cache_bust', Math.random());
    return fetch(url, {
        headers: req.headers,
        mode: req.mode,
        credentials: req.credentials,
        redirect: req.redirect
    });
}

async function updateCheck() {
    try {
        const response = await fetch(FILE_LIST_URL);
        const fileList = await response.json();
        const cacheVersion = `${STATIC_CACHE_PREFIX}${fileList.version}`;
        // Already have this version?
        if (await caches.has(cacheVersion)) return;

        // Fetch all, validate, then cache
        const responses = await Promise.all(
            fileList.files.map(file => fetchAndBust(file))
        );

        const cache = await caches.open(cacheVersion);
        await Promise.all(
            responses.map(async (response, idx) => {
                if (!response.ok) throw new Error(`Failed to fetch ${fileList.files[idx]}: ${response.status}`);
                return cache.put(fileList.files[idx], response);
            })
        );
    } catch (error) {
        console.error('Cache update failed:', error);
        throw error;
    }
}

async function handleFetchRequest(event) {
    const cacheName = await getCurrentStaticCache();
    // If no cache, just fetch
    if (!cacheName) {
        return fetch(event.request);
    }
    return serveFromCache(cacheName, event.request);
}

async function getCurrentStaticCache() {
    const names = await caches.keys();
    return getLatestCacheName(names);
}
function getLatestCacheName(names) {
    return names
        .filter(name => name.startsWith(STATIC_CACHE_PREFIX))
        .sort()
        .slice(-1)[0];
}
async function serveFromCache(cacheName, request) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached || fetch(request);
}
async function serveFromCacheOrNull(cacheName, request) {
    if (!cacheName) return null;
    const cache = await caches.open(cacheName);
    return cache.match(request);
}
function isStaticAsset(url) {
    return /\.(?:js|css|woff2?|ttf|png|jpe?g|gif|svg)(\?|#|$)/i.test(url);
}