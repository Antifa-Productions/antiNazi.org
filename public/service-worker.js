// service-worker.js

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const CONFIG = {
    MANIFEST_URL: 'file-list.json',
    CACHE_NAME_PREFIX: 'precache',
    DYNAMIC_CACHE_NAME: 'dynamic-content',
    NETWORK_TIMEOUT_MS: 3000, // 3 seconds
    MAX_DYNAMIC_ENTRIES: 50,  // Max items in dynamic cache before eviction
    DEBUG: true,
};

// Ensure ORIGIN is set correctly for local paths
const ORIGIN = self.location.origin;

/* ------------------------------------------------------------------ */
/* Logging Utilities (Moved Up - MUST be before use)                   */
/* ------------------------------------------------------------------ */

// Fixed: Defined here so it can be used during Workbox loading below
const log = (...args) => CONFIG.DEBUG && console.log('[SW]', ...args);
const warn = (...args) => CONFIG.DEBUG && console.warn('[SW]', ...args);
const error = (...args) => CONFIG.DEBUG && console.error('[SW]', ...args);

/* ------------------------------------------------------------------ */
/* Workbox Setup (Local Scripts)                                       */
/* ------------------------------------------------------------------ */
// CRITICAL: 
// 1. We use importScripts() because Service Workers cannot use 'import()'.
// 2. We load LOCAL files from /scripts/ to ensure reliability and no CORS issues.
// 3. These must be the 'prod.js' (UMD/Global) builds, NOT .mjs files.
// 4. Order matters slightly: Core first, then others.

const WORKBOX_SCRIPTS = [
    '/scripts/workbox-core.prod.js',
    '/scripts/workbox-routing.prod.js',
    '/scripts/workbox-strategies.prod.js',
    '/scripts/workbox-cacheable-response.prod.js',
    '/scripts/workbox-expiration.prod.js',
    '/scripts/workbox-background-sync.prod.js'
];

try {
    log('init', 'Loading Workbox modules from local /scripts/...');
    
    // Load all scripts synchronously. 
    // If any file is missing, the SW will throw an error and fail to install.
    WORKBOX_SCRIPTS.forEach(scriptPath => {
        try {
            importScripts(scriptPath);
            if (CONFIG.DEBUG) console.debug(`[SW] Loaded: ${scriptPath}`);
        } catch (e) {
            console.error(`[SW] ERROR loading ${scriptPath}:`, e);
            throw new Error(`Failed to load ${scriptPath}. Ensure files exist.`);
        }
    });

    log('init', 'All Workbox modules loaded successfully.');

    // Map global 'workbox' object to local constants for cleaner code
    // This handles the case where build tools minify/globals differently
    const wbRouting = workbox.routing;
    const wbStrategies = workbox.strategies;
    const wbCacheable = workbox.cacheableResponse;
    const wbExpiration = workbox.expiration;
    const wbBgSync = workbox.backgroundSync;

} catch (error) {
    console.error('[SW] FATAL: Workbox initialization failed.', error);
    // Prevent the worker from activating if dependencies are missing
    throw new Error('Service Worker Initialization Failed: Missing Workbox Libraries');
}

/* ------------------------------------------------------------------ */
/* State Management                                                    */
/* ------------------------------------------------------------------ */

let currentCacheName = '';
const precacheAllowList = new Map(); // normalized URL -> cacheKey
let warmUpUrls = [];
let strategiesInitialized = false;

// Strategy instances (initialized during 'activate')
let cacheFirstHandler, networkFirstHandler, dynamicHandler;

/* ------------------------------------------------------------------ */
/* URL Utilities                                                       */
/* ------------------------------------------------------------------ */

function normalizeUrl(url) {
    try {
        // Normalize relative URLs to absolute hrefs for consistent mapping
        const u = new URL(url, ORIGIN);
        return u.href;
    } catch {
        return null;
    }
}

function createCacheKey(url, revision) {
    const parsed = new URL(url, ORIGIN);
    if (revision) {
        parsed.searchParams.set('__rev', revision);
    }
    return parsed.href;
}

/* ------------------------------------------------------------------ */
/* Manifest Loading                                                    */
/* ------------------------------------------------------------------ */

async function loadManifest() {
    let response;
    try {
        // Fetch manifest with no-cache to ensure we get the latest version list
        response = await fetch(CONFIG.MANIFEST_URL, { cache: 'no-cache' });
    } catch (e) {
        throw new Error(`Failed to fetch manifest: Network error (${e.message})`);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
    }

    const manifest = await response.json();
    const { version, defaultRevision, groups = [], warmUp = [] } = manifest;

    // Set the cache name based on the manifest version
    currentCacheName = `${CONFIG.CACHE_NAME_PREFIX}-v${version}`;
    
    // Pre-process warm-up URLs
    warmUpUrls = warmUp.map(u => normalizeUrl(u)).filter(Boolean);

    const entries = [];
    for (const group of groups || []) {
        if (group.strategy !== 'precache') continue;
        
        for (const file of group.files ?? []) {
            const revision = file.revision ?? defaultRevision;
            const normalizedUrl = normalizeUrl(file.url);
            
            if (!normalizedUrl) {
                warn('manifest', 'Skipping invalid URL in manifest:', file.url);
                continue;
            }
            
            const cacheKey = createCacheKey(file.url, revision);
            
            // Store the mapping: Request URL -> Cached Key
            precacheAllowList.set(normalizedUrl, cacheKey);
            entries.push({ url: file.url, cacheKey, normalizedUrl });
        }
    }
    
    log('manifest', `Loaded ${entries.length} precache entries for version ${version}`);
    return entries;
}

/* ------------------------------------------------------------------ */
/* Precaching                                                          */
/* ------------------------------------------------------------------ */

async function precacheAssets() {
    const entries = await loadManifest();
    
    if (entries.length === 0) {
        log('install', 'No assets defined in manifest to precache.');
        return;
    }
    
    log('install', `Starting precache: ${entries.length} assets into '${currentCacheName}'`);
    
    const cache = await caches.open(currentCacheName);
    let successCount = 0;
    let failureCount = 0;
    const failedEntries = [];
    
    // Execute all fetches in parallel for speed
    const results = await Promise.allSettled(
        entries.map(async ({ url, cacheKey }) => {
            try {
                // Use no-cache to ensure we get the version defined by the manifest
                const response = await fetch(url, { cache: 'no-cache' });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                // Put the response in the cache using the specific cacheKey
                await cache.put(cacheKey, response);
                return { success: true, url };
            } catch (err) {
                return { success: false, url, error: err.message };
            }
        })
    );
    
    results.forEach((result) => {
        if (result.success) {
            successCount++;
        } else {
            failureCount++;
            failedEntries.push(result.url);
            warn('install', `Failed to cache: ${result.url}`, result.error);
        }
    });
    
    log('install', `Precache Summary: ${successCount}/${entries.length} succeeded.`);
    
    // Critical: If ALL fail, abort installation. If some succeed, we proceed but warn.
    if (failureCount === entries.length) {
        throw new Error('CRITICAL FAILURE: All precache requests failed. Installation aborted.');
    }
    
    if (failureCount > 0) {
        warn('install', `${failureCount} assets failed. Check logs for details.`);
    }
}

/* ------------------------------------------------------------------ */
/* Cache Cleanup                                                       */
/* ------------------------------------------------------------------ */

async function cleanupStaleCaches() {
    const keys = await caches.keys();
    const prefixPattern = new RegExp(`^${CONFIG.CACHE_NAME_PREFIX}-v\\d+$`);
    const validCacheNames = [currentCacheName, CONFIG.DYNAMIC_CACHE_NAME];
    
    let deletedCount = 0;
    
    for (const key of keys) {
        let shouldDelete = false;
        let reason = ''; // Fixed: Added declaration for 'reason' variable
        
        // Check if it's an old version of our precache
        if (prefixPattern.test(key)) {
            if (key !== currentCacheName) {
                shouldDelete = true;
                reason = `Old precache version`;
            }
        } 
        // Check if it's an unrelated cache
        else if (!validCacheNames.includes(key)) {
            shouldDelete = true;
            reason = `Unrecognized cache`;
        }
        
        if (shouldDelete) {
            log('activate', `Deleting stale cache: ${key} (${reason})`);
            await caches.delete(key);
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        log('activate', `Cleanup complete. Deleted ${deletedCount} caches.`);
    }
}

/* ------------------------------------------------------------------ */
/* Strategy Initialization                                             */
/* ------------------------------------------------------------------ */

async function initStrategies() {
    if (strategiesInitialized) return;

    // Safety check for globals
    if (!wbStrategies || !wbCacheable) {
        throw new Error("Workbox modules not detected. Check importScripts.");
    }

    // 1. Cacheable Response Plugin: Only cache 200 OK responses
    const cacheablePlugin = new wbCacheable.CacheableResponsePlugin({
        statuses: [0, 200],
    });

    // 2. Expiration Plugin: Evict old entries from Dynamic Cache (LRU)
    const expirationPlugin = new wbExpiration.ExpirationPlugin({
        maxEntries: CONFIG.MAX_DYNAMIC_ENTRIES,
        purgeOnQuotaError: true,
    });

    // 3. Background Sync Plugin: Queue failed POST/PUT/DELETE requests
    const bgSyncPlugin = new wbBgSync.BackgroundSyncPlugin('post-sync-queue', {
        maxRetentionTime: 24 * 60, // Retry for 24 hours
        onSync: async ({ queue }) => {
            let entry;
            while ((entry = await queue.shiftRequest())) {
                try {
                    await fetch(entry.request);
                    log('bg-sync', `Replayed successfully: ${entry.request.url}`);
                } catch (err) {
                    // Put it back at the FRONT of the queue
                    await queue.unshiftRequest(entry);
                    log('bg-sync', `Replay failed for ${entry.request.url}, re-queued.`, err.message);
                    // FIX: DO NOT BREAK. Continue trying other items in the queue.
                }
            }
        },
    });

    // --- Strategy 1: Static Assets (Cache First) ---
    cacheFirstHandler = new wbStrategies.CacheFirst({
        cacheName: currentCacheName,
        plugins: [cacheablePlugin],
    });

    // --- Strategy 2: Navigation (Network First) ---
    networkFirstHandler = new wbStrategies.NetworkFirst({
        cacheName: currentCacheName,
        networkTimeoutSeconds: Math.ceil(CONFIG.NETWORK_TIMEOUT_MS / 1000),
        plugins: [cacheablePlugin],
    });

    // --- Strategy 3: Dynamic API (Network First + BG Sync + Expiration) ---
    dynamicHandler = new wbStrategies.NetworkFirst({
        cacheName: CONFIG.DYNAMIC_CACHE_NAME,
        networkTimeoutSeconds: Math.ceil(CONFIG.NETWORK_TIMEOUT_MS / 1000),
        plugins: [
            cacheablePlugin,
            expirationPlugin,
            bgSyncPlugin,
        ],
    });

    strategiesInitialized = true;
    log('init', 'All caching strategies initialized.');
}

/* ------------------------------------------------------------------ */
/* Idle Cache Warming                                                  */
/* ------------------------------------------------------------------ */

async function warmUpCache() {
    if (warmUpUrls.length === 0) return;
    
    log('warming', `Triggering idle warm-up for ${warmUpUrls.length} URLs`);
    
    const cache = await caches.open(currentCacheName);
    
    for (const url of warmUpUrls) {
        // Skip if already cached
        if (await cache.match(url)) continue;
        
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) {
                await cache.put(url, response);
                log('warming', `Warmed up: ${url}`);
            } else {
                warn('warming', `Warmup failed for ${url}: HTTP ${response.status}`);
            }
        } catch (err) {
            warn('warming', `Warmup network error for ${url}:`, err.message);
        }
    }
}

function triggerWarmUp() {
    if ('requestIdleCallback' in self) {
        requestIdleCallback(warmUpCache, { timeout: 5000 });
    } else {
        // Fallback for older browsers/polyfills
        setTimeout(warmUpCache, 5000);
    }
}

/* ------------------------------------------------------------------ */
/* Event Handlers                                                      */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
    event.waitUntil(
        precacheAssets()
            .then(() => {
                log('install', 'Precaching finished successfully.');
                return self.skipWaiting();
            })
            .catch((err) => {
                error('install', 'Installation failed:', err.message);
                // Do NOT call skipWaiting if precache fails
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        cleanupStaleCaches()
            .then(() => {
                log('activate', 'Stale cache cleanup finished.');
                return self.clients.claim();
            })
            .then(() => initStrategies())
            .then(() => {
                log('activate', 'Service Worker fully active and ready.');
            })
    );
});

self.addEventListener('fetch', (event) => {
    // Ignore non-GET requests here. 
    // Background Sync plugin handles retries for mutations automatically if routed.
    if (event.request.method !== 'GET') {
        return;
    }

    // Safety: If strategies aren't ready yet (rare race condition), fall back to network
    if (!strategiesInitialized) {
        // Log only in debug mode to avoid noise
        if (CONFIG.DEBUG) console.debug('[SW] Fetch intercepted before init, passing through.');
        return;
    }

    const normalizedUrl = normalizeUrl(event.request.url);
    const cacheKey = normalizedUrl ? precacheAllowList.get(normalizedUrl) : null;

    // --- Routing Logic ---

    if (cacheKey) {
        // Case A: Request matches a precached asset
        if (isNavigationRequest(event.request)) {
            // HTML navigation: Try network, fallback to precache
            event.respondWith(
                networkFirstHandler.handle({ request: event.request }).catch(() => {
                    // Explicit fallback to the specific cached key
                    return caches.open(currentCacheName).then(cache => cache.match(cacheKey));
                })
            );
        } else {
            // JS/CSS/Images: Cache First
            event.respondWith(cacheFirstHandler.handle({ request: event.request }));
        }
    } else {
        // Case B: Not precached -> Dynamic Content
        if (isNavigationRequest(event.request)) {
            // Unknown Navigation: Try network, fallback to generic offline page
            event.respondWith(
                networkFirstHandler.handle({ request: event.request }).catch(async () => {
                    // Try to serve a generic offline.html
                    const offlinePage = await caches.match('/offline.html');
                    if (offlinePage) return offlinePage;
                    
                    // Fallback to root if available
                    const rootKey = precacheAllowList.get(normalizeUrl('/'));
                    if (rootKey) {
                        const cache = await caches.open(currentCacheName);
                        return cache.match(rootKey);
                    }
                    
                    return Response.error();
                })
            );
        } else {
            // API/JSON: Network First + BG Sync + Expiration
            event.respondWith(dynamicHandler.handle({ request: event.request }));
        }
    }

    // Trigger one-time warm-up after activation
    if (!self.warmupTriggered) {
        self.warmupTriggered = true;
        setTimeout(triggerWarmUp, 2000);
    }
});

// Helper: Detect Navigation Requests
function isNavigationRequest(request) {
    return request.mode === 'navigate' || 
           request.headers.get('accept')?.includes('text/html');
}
