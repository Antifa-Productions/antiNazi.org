/**
 * Service Worker — antinazi.org
 * Version: 2.3 (Modular ESM + Manifest-Driven Caching)
 *
 * What's new in 2.3:
 * - Fetches /file-list.json at install time as the precache manifest source
 * - Supports per-file cache directives via "strategy" field in file-list.json
 * - Falls back to hardcoded PRECACHE_MANIFEST if fetch fails
 * - All runtime strategies remain unchanged from v2.0
 */
// Import Workbox modules via ES Modules
import {
  precacheAndRoute
} from 'https://cdn.jsdelivr.net/npm/workbox-precaching@7.3.0/+esm';
import {
  registerRoute,
  setCatchHandler
} from 'https://cdn.jsdelivr.net/npm/workbox-routing@7.3.0/+g// Configuration
// ============================================================================
const CACHE_PREFIX = 'antinazi';
const CACHE_VERSION = 'v2.2'; // Bump this so browsers re-fetch
// Hardcoded critical assets — always precached regardless of file-list.json
const PRECACHE_MANIFEST = ['/offline.html', '/index.html', '/css/style_2.1.min.css', '/manifest.webmanifest', ];
const FILE_LIST_URL = '/file-list.json';
const OFFLINE_FALLBACK = '/offline.html';
// Default strategy mapping for runtime caching
const RUNTIME_STRATEGIES = {
  pages: {
    class: NetworkFirst,
    cacheName: `${CACHE_PREFIX}-pages-${CACHE_VERSION}`,
    config: {
      networkTimeoutSeconds: 1.5,
      plugins: [
        new CacheableResponsePlugin({
          statuses: [200]
        }),
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        }),
      ],
    },
  },
  assets: {
    class: StaleWhileRevalidate,
    cacheName: `${CACHE_PREFIX}-assets-${CACHE_VERSION}`,
    config: {
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
      ],
    },
  },
  images: {
    class: CacheFirst,
    cacheName: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
    config: {
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
        }),
      ],
    },
  },
  documents: {
    class: StaleWhileRevalidate,
    cacheName: `${CACHE_PREFIX}-docs-${CACHE_VERSION}`,
    config: {
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200]
        }),
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 90 * 24 * 60 * 60, // 90 days
        }),
      ],
    },
  },
};
// ============================================================================
// Lifecycle Management
// ============================================================================
clientsClaim();
skipWaiting();
// ============================================================================
// Manifest Loading & Precaching
// ============================================================================
/**
 * Fetches /file-list.json and merges its contents with the hardcoded
 * PRECACHE_MANIFEST. Entries in file-list.json can optionally specify:
 *   - "url": the path to precache (required)
 *   - "revision": a hash or version string for cache busting (optional)
 *   - "precache": true/false — whether to precache on install (default: true)
 *   - "strategy": override the runtime caching strategy for this file
 *                 ("network-first", "stale-while-revalidate", "cache-first")
 *
 * Expected file-list.json format:
 * {
 *   "files": [
 *     { "url": "/offline.html", "precache": true },
 *     { "url": "/css/style_2.1.min.css", "precache": true },
 *     { "url": "/images/og-default.png", "precache": true, "strategy": "cache-first" },
 *     { "url": "/authors/hapgood/index.html", "precache": false }
 *   ]
 * }
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(FILE_LIST_URL, {
          cache: 'no-store'
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const fileList = data.files || data || [];
        // Merge: start with hardcoded manifest
        const mergedUrls = new Set(PRECACHE_MANIFEST);
        // Add entries from file-list.json that have precache !== false
        for (const entry of fileList) {
          if (typeof entry === 'string') {
            mergedUrls.add(entry);
          } else if (entry && entry.url && entry.precache !== false) {
            mergedUrls.add(entry.url);
          }
        }
        // Convert to Workbox precache format
        const precacheEntries = Array.from(mergedUrls).map((url) => ({
          url,
          revision: CACHE_VERSION,
        }));
        // Register with Workbox
        precacheAndRoute(precacheEntries);
        console.log(`[SW] Precached ${precacheEntries.length} assets from file-list.json + hardcoded manifest`);
      } catch (error) {
        console.warn('[SW] Failed to fetch file-list.json, falling back to hardcoded manifest:', error);
        // Fallback: precache only the hardcoded list
        const fallbackEntries = PRECACHE_MANIFEST.map((url) => ({
          url,
          revision: CACHE_VERSION,
        }));
        precacheAndRoute(fallbackEntries);
        console.log(`[SW] Precached ${fallbackEntries.length} assets (fallback mode)`);
      }
    })());
});
// ============================================================================
// Runtime Caching Strategies
// ============================================================================
// 1. Navigation Requests (HTML Pages)
registerRoute(
  ({
    request
  }) => request.mode === 'navigate', new NetworkFirst({
    cacheName: RUNTIME_STRATEGIES.pages.cacheName,
    networkTimeoutSeconds: RUNTIME_STRATEGIES.pages.config.networkTimeoutSeconds,
    plugins: RUNTIME_STRATEGIES.pages.config.plugins,
  }));
// 2. Static Assets (CSS, JS, Fonts)
registerRoute(
  ({
    request
  }) => ['style', 'script', 'font'].includes(request.destination), new StaleWhileRevalidate({
    cacheName: RUNTIME_STRATEGIES.assets.cacheName,
    plugins: RUNTIME_STRATEGIES.assets.config.plugins,
  }));
// 3. Images
registerRoute(
  ({
    request
  }) => request.destination === 'image', new CacheFirst({
    cacheName: RUNTIME_STRATEGIES.images.cacheName,
    plugins: RUNTIME_STRATEGIES.images.config.plugins,
  }));
// 4. Documents (PDFs, etc.)
registerRoute(
  ({
    request
  }) => request.destination === 'document' || request.url.endsWith('.pdf'), new StaleWhileRevalidate({
    cacheName: RUNTIME_STRATEGIES.documents.cacheName,
    plugins: RUNTIME_STRATEGIES.documents.config.plugins,
  }));
// ============================================================================
// Fallback Handling
// ============================================================================
setCatchHandler(async ({
  event,
  request
}) => {
  if (request.mode === 'navigate') {
    try {
      const cache = await caches.open(RUNTIME_STRATEGIES.pages.cacheName);
      const cachedResponse = await cache.match(OFFLINE_FALLBACK);
      if (cachedResponse) {
        return cachedResponse;
      }
    } catch (err) {
      console.error('[SW] Fallback failed:', err);
    }
    return Response.error();
  }
  return Response.error();
});
// ============================================================================
// Message Handling
// ============================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    skipWaiting();
  }
});
console.log(`[SW] Antinazi.org SW v${CACHE_VERSION} loaded (Manifest-Driven)`);
