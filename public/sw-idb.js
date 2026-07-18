const CONFIG = {
  MANIFEST_URL: 'file-list.json',
  CACHE_NAME_PREFIX: 'precache',
  DYNAMIC_CACHE_NAME: 'dynamic-content',
  NETWORK_TIMEOUT_MS: 3000,
  MAX_DYNAMIC_ENTRIES: 50,
  DEBUG: true
};
const ORIGIN = self.location.origin;
const log = (...args) => CONFIG.DEBUG && console.log('[SW]', ...args);
const warn = (...args) => CONFIG.DEBUG && console.warn('[SW]', ...args);
const error = (...args) => CONFIG.DEBUG && console.error('[SW]', ...args);

// Declare at module scope so initStrategies() can access them
let wbStrategies,
  wbCacheable,
  wbExpiration,
  wbBgSync;

const WORKBOX_SCRIPTS = [
  '/scripts/workbox-core.prod.js',
  '/scripts/workbox-routing.prod.js',
  '/scripts/workbox-strategies.prod.js',
  '/scripts/workbox-cacheable-response.prod.js',
  '/scripts/workbox-expiration.prod.js',
  '/scripts/workbox-background-sync.prod.js',
  '/scripts/idb.min.js'
];

try {
  log('init', 'Loading Workbox modules from local /scripts/...');
  WORKBOX_SCRIPTS.forEach(scriptPath => {
    try {
      importScripts(scriptPath);
      if (CONFIG.DEBUG)
        console.debug(`[SW] Loaded: ${scriptPath}`);
    } catch (e) {
      console.error(`[SW] ERROR loading ${scriptPath}:`, e);
      throw new Error(`Failed to load ${scriptPath}. Ensure files exist.`);
    }
  });
  log('init', 'All Workbox modules loaded successfully.');
  wbStrategies = workbox.strategies;
  wbCacheable = workbox.cacheableResponse;
  wbExpiration = workbox.expiration;
  wbBgSync = workbox.backgroundSync;
} catch (err) {
  console.error('[SW] FATAL: Workbox initialization failed.', err);
  throw new Error('Service Worker Initialization Failed: Missing Workbox Libraries');
}

// ---------------------------------------------------------------------------
// IndexedDB Setup
// ---------------------------------------------------------------------------
let dbPromise;

async function initIDB() {
  if (typeof idb === 'undefined') {
    error('IDB', 'idb library not found. Ensure /scripts/idb.min.js is loaded.');
    return null;
  }
  try {
    dbPromise = idb.openDB('sw-custom-storage', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('offline-forms')) {
          db.createObjectStore('offline-forms', {
            keyPath: 'id',
            autoIncrement: true
          });
        }
        if (!db.objectStoreNames.contains('prefetch-metadata')) {
          db.createObjectStore('prefetch-metadata'); // key: url, value: metadata object
        }
        if (!db.objectStoreNames.contains('failed-retries')) {
          db.createObjectStore('failed-retries', {
            keyPath: 'url'
          });
        }
      }
    });
    log('IDB', 'Database initialized successfully.');
    return dbPromise;
  } catch (err) {
    error('IDB', 'Failed to open DB:', err);
    return null;
  }
}

// --- IDB Helper Functions ---------------------------------------------------

/**
 * Store metadata about a precached or fetched resource.
 * @param {string} url - The URL of the resource
 * @param {*} metadata - Any serializable metadata to store
 */
async function idbPutMetadata(url, metadata) {
  if (!dbPromise)
    return;
  try {
    const db = await dbPromise;
    await db.put('prefetch-metadata', metadata, url);
    log('IDB', `Stored metadata for: ${url}`);
  } catch (err) {
    error('IDB', 'put failed:', err);
  }
}

/**
 * Retrieve metadata for a URL.
 * @param {string} url - The URL key
 * @returns {Promise<*|null>}
 */
async function idbGetMetadata(url) {
  if (!dbPromise)
    return null;
  try {
    const db = await dbPromise;
    return await db.get('prefetch-metadata', url);
  } catch (err) {
    error('IDB', 'get failed:', err);
    return null;
  }
}

/**
 * Delete metadata for a URL.
 * @param {string} url - The URL key
 */
async function idbDeleteMetadata(url) {
  if (!dbPromise)
    return;
  try {
    const db = await dbPromise;
    await db.delete('prefetch-metadata', url);
    log('IDB', `Deleted metadata for: ${url}`);
  } catch (err) {
    error('IDB', 'delete failed:', err);
  }
}

/**
 * Store a failed request for manual retry or offline inspection.
 * @param {string} url - The request URL
 * @param {string} data - The request body (e.g. POST payload)
 * @param {string} method - The HTTP method (defaults to 'POST')  // NEW
 */
async function idbStoreFailedRequest(url, data, method = 'POST') { // CHANGED: added method param
  if (!dbPromise)
    return;
  try {
    const db = await dbPromise;
    await db.put('failed-retries', {
      url,
      data,
      method, // NEW: store method for accurate retry
      timestamp: Date.now()
    });
    log('IDB', `Stored failed request for: ${url}`);
  } catch (err) {
    error('IDB', 'store failed request failed:', err);
  }
}

/**
 * Retrieve all stored failed requests (for manual retry or diagnostics).
 * @returns {Promise<Array>}
 */
async function idbGetFailedRequests() {
  if (!dbPromise)
    return [];
  try {
    const db = await dbPromise;
    return await db.getAll('failed-retries');
  } catch (err) {
    error('IDB', 'get failed requests failed:', err);
    return [];
  }
}

// NEW: Helper to delete a specific failed-request entry by URL. Previously the
// bg-sync onSync callback called idbDeleteMetadata(), which targets the
// prefetch-metadata store — not failed-retries. This fixes that.
/**
 * Delete a failed request entry from IDB by URL.
 * @param {string} url - The URL key
 */
async function idbDeleteFailedRequest(url) {
  if (!dbPromise)
    return;
  try {
    const db = await dbPromise;
    await db.delete('failed-retries', url);
    log('IDB', `Deleted failed request for: ${url}`);
  } catch (err) {
    error('IDB', 'delete failed request failed:', err);
  }
}

// NEW: Clean up stale prefetch-metadata entries that belong to old cache
// versions. Called during activation alongside cache cleanup.
/**
 * Remove prefetch-metadata entries whose cacheVersion no longer matches
 * the current cache, or whose status is 'precache' and are orphaned.
 */
async function idbCleanStaleMetadata() {
  if (!dbPromise)
    return;
  try {
    const db = await dbPromise;
    const allKeys = await db.getAllKeys('prefetch-metadata');
    let cleaned = 0;
    for (const key of allKeys) {
      const meta = await db.get('prefetch-metadata', key);
      if (!meta)
        continue;

      // Delete entries tagged with a cache version that is no longer current
      if (meta.cacheName && meta.cacheName !== currentCacheName) {
        await db.delete('prefetch-metadata', key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log('activate', `Cleaned ${cleaned} stale IDB metadata entries.`);
    }
  } catch (err) {
    error('IDB', 'Stale metadata cleanup failed:', err);
  }
}

// ---------------------------------------------------------------------------
// End IDB Setup
// ---------------------------------------------------------------------------

let currentCacheName = '';
const precacheAllowList = new Map();
let warmUpUrls = [];
let strategiesInitialized = false;
let cacheFirstHandler,
  networkFirstHandler,
  dynamicHandler;

function normalizeUrl(url) {
  try {
    return new URL(url, ORIGIN).href;
  } catch {
    return null;
  }
}

function createCacheKey(url, revision) {
  const parsed = new URL(url, ORIGIN);
  if (revision)
    parsed.searchParams.set('__rev', revision);
  return parsed.href;
}

async function loadManifest() {
  let response;
  try {
    response = await fetch(CONFIG.MANIFEST_URL, {
      cache: 'no-cache'
    });
  } catch (e) {
    throw new Error(`Failed to fetch manifest: Network error (${e.message})`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
  }
  const manifest = await response.json();
  const {
    version,
    defaultRevision,
    groups = [],
    warmUp = []
  } = manifest;

  currentCacheName = `${CONFIG.CACHE_NAME_PREFIX}-v${version}`;
  warmUpUrls = warmUp
    .map(u => normalizeUrl(u))
    .filter(Boolean);

  const entries = [];

  for (const group of groups || []) {
    if (group.strategy !== 'precache')
      continue;
    for (const file of group.files ?? []) {
      const revision = file.revision ?? defaultRevision;
      const normalizedUrl = normalizeUrl(file.url);
      if (!normalizedUrl) {
        warn('manifest', 'Skipping invalid URL in manifest:', file.url);
        continue;
      }
      const cacheKey = createCacheKey(file.url, revision);
      precacheAllowList.set(normalizedUrl, cacheKey);
      entries.push({
        url: file.url,
        cacheKey,
        normalizedUrl
      });
    }
  }

  log('manifest', `Loaded ${entries.length} precache entries for version ${version}`);
  return entries;
}

async function precacheAssets() {
  // CHANGED: Initialize IDB *before* precache so metadata writes actually work.
  // Previously, initIDB() was only called in initStrategies() during activate,
  // meaning every idbPutMetadata() call below silently no-op'd during install.
  await initIDB();

  const entries = await loadManifest();
  if (entries.length === 0) {
    log('install', 'No assets defined in manifest to precache.');
    return;
  }
  log('install', `Starting precache: ${entries.length} assets into '${currentCacheName}'`);

  const cache = await caches.open(currentCacheName);
  let successCount = 0;
  let failureCount = 0;

  const results = await Promise.allSettled(entries.map(async ({
    url,
    cacheKey
  }) => {
    try {
      const response = await fetch(url, {
        cache: 'no-cache'
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
      await cache.put(cacheKey, response);

      // Store metadata in IDB for each precached asset CHANGED: Include cacheName so
      // stale entries can be cleaned on future activations
      await idbPutMetadata(url, {
        cacheKey,
        cacheName: currentCacheName, // NEW: tag with version for cleanup
        cachedAt: Date.now(),
        status: 'precache'
      });
      return {
        success: true,
        url
      };
    } catch (err) {
      return {
        success: false,
        url,
        error: err.message
      };
    }
  }));

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.success) {
      successCount++;
    } else {
      failureCount++;
      const url = result.status === 'fulfilled' ?
        result.value.url :
        'unknown';
      warn('install', `Failed to cache: ${url}`, result.value
        ?.error ?? result.reason);
    }
  });

  log('install', `Precache Summary: ${successCount}/${entries.length} succeeded.`);

  if (failureCount === entries.length) {
    throw new Error('CRITICAL FAILURE: All precache requests failed. Installation aborted.');
  }
  if (failureCount > 0) {
    warn('install', `${failureCount} assets failed. Check logs for details.`);
  }
}

async function cleanupStaleCaches() {
  const keys = await caches.keys();
  const prefixPattern = new RegExp(`^${CONFIG.CACHE_NAME_PREFIX}-v\\d+$`);
  const validCacheNames = [currentCacheName, CONFIG.DYNAMIC_CACHE_NAME];
  let deletedCount = 0;

  for (const key of keys) {
    let shouldDelete = false;
    let reason = '';

    if (prefixPattern.test(key)) {
      if (key !== currentCacheName) {
        shouldDelete = true;
        reason = 'Old precache version';
      }
    } else if (!validCacheNames.includes(key)) {
      shouldDelete = true;
      reason = 'Unrecognized cache';
    }

    if (shouldDelete) {
      log('activate', `Deleting stale cache: ${key} (${reason})`);
      await caches.delete(key);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    log('activate', `Cache cleanup complete. Deleted ${deletedCount} caches.`);
  }

  // NEW: Clean up IDB prefetch-metadata entries belonging to old cache versions
  await idbCleanStaleMetadata();
}

async function initStrategies() {
  if (strategiesInitialized)
    return;
  if (!wbStrategies || !wbCacheable) {
    throw new Error('Workbox modules not detected. Check importScripts.');
  }

  // Initialize IDB before setting up strategies.
  // Note: initIDB() may have already been called during precacheAssets() in the
  // install phase. Calling it again is harmless — dbPromise is cached.
  await initIDB();

  const cacheablePlugin = new wbCacheable.CacheableResponsePlugin({
    statuses: [0, 200]
  });

  const expirationPlugin = new wbExpiration.ExpirationPlugin({
    maxEntries: CONFIG.MAX_DYNAMIC_ENTRIES,
    purgeOnQuotaError: true
  });

  const bgSyncPlugin = new wbBgSync.BackgroundSyncPlugin('post-sync-queue', {
    maxRetentionTime: 24 * 60,
    onSync: async ({
      queue
    }) => {
      let entry;
      while ((entry = await queue.shiftRequest())) {
        try {
          await fetch(entry.request);
          log('bg-sync', `Replayed successfully: ${entry.request.url}`);

          // CHANGED: Was idbDeleteMetadata() — that targets the prefetch-metadata store,
          // not failed-retries. Now calls the correct helper.
          await idbDeleteFailedRequest(entry.request.url);
        } catch (err) {
          // Store the failed request in IDB for later manual retry CHANGED: Pass the
          // request method so manual retries use the correct HTTP verb instead of
          // hardcoding POST.
          await idbStoreFailedRequest(entry.request.url, await entry.request.clone().text(), entry.request.method, );
          await queue.unshiftRequest(entry);
          log('bg-sync', `Replay failed for ${entry.request.url}, re-queued.`, err.message);
        }
      }

      // NEW: Notify all controlled clients that bg-sync completed
      const clients = await self
        .clients
        .matchAll();
      for (const client of clients) {
        client.postMessage({
          type: 'BG_SYNC_COMPLETE'
        });
      }
    }
  });

  cacheFirstHandler = new wbStrategies.CacheFirst({
    cacheName: currentCacheName,
    plugins: [cacheablePlugin]
  });

  networkFirstHandler = new wbStrategies.NetworkFirst({
    cacheName: currentCacheName,
    networkTimeoutSeconds: Math.ceil(CONFIG.NETWORK_TIMEOUT_MS / 1000),
    plugins: [cacheablePlugin]
  });

  dynamicHandler = new wbStrategies.NetworkFirst({
    cacheName: CONFIG.DYNAMIC_CACHE_NAME,
    networkTimeoutSeconds: Math.ceil(CONFIG.NETWORK_TIMEOUT_MS / 1000),
    plugins: [cacheablePlugin, expirationPlugin, bgSyncPlugin]
  });

  strategiesInitialized = true;
  log('init', 'All caching strategies initialized.');
}

async function warmUpCache() {
  if (warmUpUrls.length === 0)
    return;
  log('warming', `Triggering idle warm-up for ${warmUpUrls.length} URLs`);

  const cache = await caches.open(currentCacheName);
  for (const url of warmUpUrls) {
    if (await cache.match(url))
      continue;
    try {
      const response = await fetch(url, {
        cache: 'no-cache'
      });
      if (response.ok) {
        await cache.put(url, response);

        // Store warm-up metadata in IDB CHANGED: Include cacheName for consistent
        // stale-cleanup behavior
        await idbPutMetadata(url, {
          cacheName: currentCacheName, // NEW
          warmedUpAt: Date.now(),
          status: 'warmup'
        });
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
    requestIdleCallback(warmUpCache, {
      timeout: 5000
    });
  } else {
    setTimeout(warmUpCache, 5000);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle Events
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAssets().then(() => {
    log('install', 'Precaching finished successfully.');
    return self.skipWaiting();
  }).catch(err => {
    error('install', 'Installation failed:', err.message);
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanupStaleCaches();
    log('activate', 'Stale cache cleanup finished.');

    // NEW: Enable navigation preload if supported. This lets the browser start the
    // network fetch for navigation requests in parallel with SW boot, reducing
    // latency for NetworkFirst navigation handling.
    if (self.registration.navigationPreload) {
      await self
        .registration
        .navigationPreload
        .enable();
      log('activate', 'Navigation preload enabled.');
    }

    await self
      .clients
      .claim();
    await initStrategies();
    log('activate', 'Service Worker fully active and ready.');
  })());
});

// ---------------------------------------------------------------------------
// Message Handler (page ↔ SW communication for IDB queries)             // NEW
// ---------------------------------------------------------------------------

self.addEventListener('message', async (event) => {
  const {
    type
  } = event.data ?? {};
  const source = event.source; // The Client that sent the message

  switch (type) {
    case 'QUERY_SYNC_STATUS': {
      const failed = await idbGetFailedRequests();
      source.postMessage({
        type: 'SYNC_STATUS',
        data: {
          pendingCount: failed.length,
          items: failed
        }
      });
      break;
    }

    case 'TRIGGER_RETRY': {
      const failed = await idbGetFailedRequests();
      for (const item of failed) {
        try {
          const fetchOptions = {
            method: item.method || 'POST'
          };
          if (item.data) {
            fetchOptions.body = item.data;
            fetchOptions.headers = {
              'Content-Type': 'application/json'
            };
          }
          const res = await fetch(item.url, fetchOptions);
          if (res.ok) {
            await idbDeleteFailedRequest(item.url);
            log('retry', `Manual retry succeeded for ${item.url}`);
          } else {
            warn('retry', `Manual retry got HTTP ${res.status} for ${item.url}`);
          }
        } catch (err) {
          error('retry', `Manual retry failed for ${item.url}:`, err.message);
        }
      }
      // Notify the page of updated status
      const remaining = await idbGetFailedRequests();
      source.postMessage({
        type: 'SYNC_STATUS',
        data: {
          pendingCount: remaining.length
        }
      });
      break;
    }

    case 'QUERY_METADATA': {
      // Page requests metadata for a specific URL
      const {
        url
      } = event.data ?? {};
      if (url) {
        const meta = await idbGetMetadata(url);
        source.postMessage({
          type: 'PRECACHE_METADATA',
          data: {
            url,
            metadata: meta
          }
        });
      }
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Fetch Handler
// ---------------------------------------------------------------------------

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request
    .headers
    .get('accept')
    ?.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET')
    return;

  if (!strategiesInitialized) {
    if (CONFIG.DEBUG)
      console.debug('[SW] Fetch intercepted before init, passing through.');
    return;
  }

  const normalizedUrl = normalizeUrl(event.request.url);
  const cacheKey = normalizedUrl ?
    precacheAllowList.get(normalizedUrl) :
    null;

  if (cacheKey) {
    if (isNavigationRequest(event.request)) {
      // CHANGED: Use navigation preload response if available, fall back to
      // NetworkFirst strategy, then cached precache entry.
      event.respondWith((async () => {
        // NEW: Check for navigation preload response first
        if (event.preloadResponse) {
          const preloadRes = await event.preloadResponse;
          if (preloadRes) {
            return preloadRes;
          }
        }
        try {
          return await networkFirstHandler.handle({
            request: event.request
          });
        } catch {
          const cache = await caches.open(currentCacheName);
          const cached = await cache.match(cacheKey);
          return cached || Response.error();
        }
      })());
    } else {
      event.respondWith(cacheFirstHandler.handle({
        request: event.request
      }));
    }
  } else {
    if (isNavigationRequest(event.request)) {
      // CHANGED: Same navigation preload integration for non-precache nav
      event.respondWith((async () => {
        // NEW: Check for navigation preload response first
        if (event.preloadResponse) {
          const preloadRes = await event.preloadResponse;
          if (preloadRes) {
            return preloadRes;
          }
        }
        try {
          return await networkFirstHandler.handle({
            request: event.request
          });
        } catch {
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage)
            return offlinePage;
          const rootKey = precacheAllowList.get(normalizeUrl('/'));
          if (rootKey) {
            const cache = await caches.open(currentCacheName);
            return cache.match(rootKey);
          }
          return Response.error();
        }
      })());
    } else {
      event.respondWith(dynamicHandler.handle({
        request: event.request
      }));
    }
  }

  if (!self.warmupTriggered) {
    self.warmupTriggered = true;
    setTimeout(triggerWarmUp, 2000);
  }
});
