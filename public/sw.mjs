/**
 * Service Worker — antinazi.org
 * Version: 2.4 (Unified Hybrid Loader)
 *
 * Features:
 * - Merges hardcoded critical assets with dynamic file-list.json
 * - Guarantees precaching of core CSS/HTML even if JSON fails
 * - Centralized runtime strategy configuration
 * - ES Modules (fixes iOS 'export' errors)
 */

// Import Workbox modules via ES Modules
import { precacheAndRoute } from 'https://cdn.jsdelivr.net/npm/workbox-precaching@7.3.0/+esm';
import { registerRoute, setCatchHandler } from 'https://cdn.jsdelivr.net/npm/workbox-routing@7.3.0/+esm';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'https://cdn.jsdelivr.net/npm/workbox-strategies@7.3.0/+esm';
import { CacheableResponsePlugin } from 'https://cdn.jsdelivr.net/npm/workbox-cacheable-response@7.3.0/+esm';
import { ExpirationPlugin } from 'https://cdn.jsdelivr.net/npm/workbox-expiration@7.3.0/+esm';
import { clientsClaim, skipWaiting } from 'https://cdn.jsdelivr.net/npm/workbox-core@7.3.0/+esm';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_PREFIX = 'antinazi';
const CACHE_VERSION = 'v2.4';

const FILE_LIST_URL = '/file-list.json';
const OFFLINE_FALLBACK = '/offline.html';

// CRITICAL: These files are ALWAYS precached, regardless of file-list.json status.
// This ensures the site remains functional if the JSON fetch fails.
const HARDCODED_CORE = [
  '/offline.html',
  '/index.html',
  '/css/style_2.1.min.css',
  '/manifest.webmanifest',
];

// ============================================================================
// Runtime Strategy Definitions (Centralized)
// ============================================================================

const RUNTIME_STRATEGIES = {
  pages: {
    class: NetworkFirst,
    cacheName: `${CACHE_PREFIX}-pages-${CACHE_VERSION}`,
    networkTimeoutSeconds: 1.5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 1 Day
      }),
    ],
  },
  assets: {
    class: StaleWhileRevalidate,
    cacheName: `${CACHE_PREFIX}-assets-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  },
  images: {
    class: CacheFirst,
    cacheName: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
      }),
    ],
  },
  documents: {
    class: StaleWhileRevalidate,
    cacheName: `${CACHE_PREFIX}-docs-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 90 * 24 * 60 * 60, // 90 Days
      }),
    ],
  },
};

// ============================================================================
// Lifecycle Management
// ============================================================================

clientsClaim();
skipWaiting();

// ============================================================================
// Dynamic Precaching Logic
// ============================================================================

let precacheEntries = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(FILE_LIST_URL, {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const rawFiles = Array.isArray(data) ? data : (data.files || []);

        // Build deduplicated manifest using a Map keyed by URL
        const uniqueUrls = new Map();

        // Add hardcoded core first (these always take priority)
        HARDCODED_CORE.forEach((url) => {
          uniqueUrls.set(url, { url, revision: CACHE_VERSION });
        });

        // Add JSON entries (respecting "precache": false)
        for (const entry of rawFiles) {
          if (typeof entry === 'string') {
            uniqueUrls.set(entry, { url: entry, revision: CACHE_VERSION });
          } else if (entry && typeof entry === 'object' && entry.url && entry.precache !== false) {
            uniqueUrls.set(entry.url, {
              url: entry.url,
              revision: entry.revision || CACHE_VERSION,
            });
          }
        }

        precacheEntries = Array.from(uniqueUrls.values());

        console.log(`[SW] Loaded ${precacheEntries.length} assets (Core + JSON)`);
      } catch (error) {
        console.warn(`[SW] file-list.json failed (${error.message}). Using core only.`);
        precacheEntries = HARDCODED_CORE.map((url) => ({ url, revision: CACHE_VERSION }));
        console.log(`[SW] Precaching ${precacheEntries.length} core assets (Fallback Mode).`);
      }

      // Register with Workbox AFTER the manifest is built
      precacheAndRoute(precacheEntries);
    })()
  );
});

// ============================================================================
// Runtime Caching Strategies
// ============================================================================

// 1. Navigation Requests (HTML Pages)
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new RUNTIME_STRATEGIES.pages.class({
    cacheName: RUNTIME_STRATEGIES.pages.cacheName,
    networkTimeoutSeconds: RUNTIME_STRATEGIES.pages.networkTimeoutSeconds,
    plugins: RUNTIME_STRATEGIES.pages.plugins,
  })
);

// 2. Static Assets (CSS, JS, Fonts)
registerRoute(
  ({ request }) => ['style', 'script', 'font'].includes(request.destination),
  new RUNTIME_STRATEGIES.assets.class({
    cacheName: RUNTIME_STRATEGIES.assets.cacheName,
    plugins: RUNTIME_STRATEGIES.assets.plugins,
  })
);

// 3. Images
registerRoute(
  ({ request }) => request.destination === 'image',
  new RUNTIME_STRATEGIES.images.class({
    cacheName: RUNTIME_STRATEGIES.images.cacheName,
    plugins: RUNTIME_STRATEGIES.images.plugins,
  })
);

// 4. Documents (PDFs, etc.)
registerRoute(
  ({ request }) =>
    request.destination === 'document' || request.url.endsWith('.pdf'),
  new RUNTIME_STRATEGIES.documents.class({
    cacheName: RUNTIME_STRATEGIES.documents.cacheName,
    plugins: RUNTIME_STRATEGIES.documents.plugins,
  })
);

// ============================================================================
// Fallback Handling
// ============================================================================

setCatchHandler(async ({ event, request }) => {
  if (request.mode === 'navigate') {
    try {
      const cache = await caches.open(RUNTIME_STRATEGIES.pages.cacheName);
      const cachedResponse = await cache.match(OFFLINE_FALLBACK);
      if (cachedResponse) return cachedResponse;
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

console.log(`[SW] Antinazi.org SW v${CACHE_VERSION} loaded (Unified Hybrid)`);
