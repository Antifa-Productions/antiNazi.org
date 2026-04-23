const FILE_LIST_URL = 'file-list.json';
const CACHE_PREFIX = 'file-list-v';
const STATIC_CACHE_PREFIX = 'static-separate-list-v';

self.skipWaiting();

/**
 * Fetches a request with cache busting by appending a random query parameter
 * @param {string|Request} request - The request to fetch
 * @returns {Promise<Response>} The fetch response
 */
function fetchAndBust(request) {
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

/**
 * Checks for updates to cached files and updates the cache if a new version exists
 * @returns {Promise<void>}
 */
async function updateCheck() {
    try {
        const response = await fetch(FILE_LIST_URL);
        const fileList = await response.json();
        const cacheVersion = `${CACHE_PREFIX}${fileList.version}`;
        
        // Cache already exists for this version
        if (await caches.has(cacheVersion)) {
            return;
        }

        // Fetch all files and cache them
        const responses = await Promise.all(
            fileList.files.map(file => fetchAndBust(file))
        );

        const cache = await caches.open(cacheVersion);
        
        // Validate responses and add to cache
        await Promise.all(
            responses.map(async (response, index) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${fileList.files[index]}: ${response.status}`);
                }
                return cache.put(fileList.files[index], response);
            })
        );
    } catch (error) {
        // Clean up incomplete cache on error
        console.error('Cache update failed:', error);
        throw error;
    }
}

/**
 * Install event handler - attempts to update cache on service worker install
 */
self.addEventListener('install', event => {
    event.waitUntil(
        updateCheck().catch(error => {
            console.warn('Installation cache update failed:', error);
            // Continue installation despite cache update failure
        })
    );
});

/**
 * Fetch event handler - serves cached content with fallback to network
 */
self.addEventListener('fetch', event => {
    const responsePromise = handleFetchRequest(event);
    
    // For navigation requests, attempt to update cache in background
    if (event.request.mode === 'navigate') {
        event.waitUntil(
            responsePromise
                .then(() => updateCheck())
                .catch(error => console.warn('Background update check failed:', error))
        );
    }
    
    event.respondWith(responsePromise);
});

/**
 * Handles fetch requests by checking cache and falling back to network
 * @param {FetchEvent} event - The fetch event
 * @returns {Promise<Response>} The response
 */
async function handleFetchRequest(event) {
    const cacheNames = await caches.keys();
    const staticCacheNames = cacheNames.filter(name =>
        name.startsWith(STATIC_CACHE_PREFIX)
    );

    // No cache available, fetch from network
    if (staticCacheNames.length === 0) {
        return fetch(event.request);
    }

    // For navigation requests, check if we should update to a newer cache
    if (event.request.mode === 'navigate' && staticCacheNames.length > 1) {
        const clients = await self.clients.matchAll();
        
        // Only switch to latest cache if this is the only client
        if (clients.length === 1) {
            const oldCaches = staticCacheNames.slice(0, -1);
            const newCacheName = staticCacheNames[staticCacheNames.length - 1];
            
            // Clean up old caches
            await Promise.all(oldCaches.map(cache => caches.delete(cache)));
            
            return serveFromCache(newCacheName, event.request);
        }
    }

    // Serve from current cache
    return serveFromCache(staticCacheNames[0], event.request);
}

/**
 * Serves a request from the specified cache, falling back to network
 * @param {string} cacheName - Name of the cache to use
 * @param {Request} request - The fetch request
 * @returns {Promise<Response>} The response
 */
async function serveFromCache(cacheName, request) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    return cachedResponse || fetch(request);
}
