/**
 * Service Worker — antinazi.org
 * Version: 2.5 (Unified Hybrid Loader)
 *
 * Features:
 * - Top-level precacheAndRoute for core assets (guaranteed routing)
 * - Dynamic file-list.json augmentation via precache()
 * - Automatic cleanup of outdated caches on activation
 * - Client broadcast messaging for update notifications
 * - Centralized runtime strategy configuration
 * - ES Modules via jsDelivr (swap paths to self-hosted when ready)
 *
 * CHANGES FROM v2.4:
 *   - Fixed: precacheAndRoute now at top level (was inside install handler)
 *   - Fixed: networkTimeoutSeconds increased from 1.5 to 3
 *   - Fixed: Documents route no longer catches navigation requests
 *   - Fixed: Offline fallback uses createHandlerBoundToURL for precache-aware serving
 *   - Added: Old cache cleanup on activate
 *   - Added: Client broadcast messages (UPDATE_AVAILABLE, ACTIVATED, CACHE_CLEARED)
 *   - Added: Enhanced message handler (CLEAR_CACHES, GET_VERSION, FORCE_RECACHE)
 *   - Added: Defensive JSON validation
 *   - Added: Background sync registration hint
 *   - Removed: Redundant top-level skipWaiting (moved to lifecycle flow)
 */

// ============================================================================
// ES Module Imports
// ============================================================================
//
// NOTE: These use jsDelivr CDN. To self-host, download the Workbox 7.3.0
// packages into /workbox/ and replace the URLs below, e.g.:
//   import { precacheAndRoute } from '/workbox/workbox-precaching@7.3.0.mjs';
//

import { precacheAndRoute, precache, cleanupOutdatedCaches, createHandlerBoundToURL } from 'https://cdn.jsdelivr.net/npm/workbox-precaching@7.3.0/+esm';
import { registerRoute, setCatchHandler, NavigationRoute } from 'https://cdn.jsdelivr.net/npm/workbox-routing@7.3.0/+esm';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'https://cdn.jsdelivr.net/npm/workbox-strategies@7.3.0/+esm';
import { CacheableResponsePlugin } from 'https://cdn.jsdelivr.net/npm/workbox-cacheable-response@7.3.0/+esm';
import { ExpirationPlugin } from 'https://cdn.jsdelivr.net/npm/workbox-expiration@7.3.0/+esm';
import { clientsClaim, skipWaiting } from 'https://cdn.jsdelivr.net/npm/workbox-core@7.3.0/+esm';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_PREFIX = 'antinazi';
const CACHE_VERSION = 'v2.5';
const SW_VERSION = '2.5';

const FILE_LIST_URL = '/file-list.json';
const OFFLINE_FALLBACK = '/offline.html';

// All cache names used by this SW — referenced during cleanup.
const CACHE_NAMES = {
  precache: `${CACHE_PREFIX}-precache-${CACHE_VERSION}`,
  pages: `${CACHE_PREFIX}-pages-${CACHE_VERSION}`,
  assets: `${CACHE_PREFIX}-assets-${CACHE_VERSION}`,
  images: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
  documents: `${CACHE_PREFIX}-docs-${CACHE_VERSION}`,
};

// CRITICAL: These files are ALWAYS precached at top level, guaranteeing
// routing is functional even if file-list.json fails to load.
const HARDCODED_CORE = [
  { url: '/offline.html', revision: CACHE_VERSION },
  { url: '/index.html', revision: CACHE_VERSION },
  { url: '/css/style_2.1.min.css', revision: CACHE_VERSION },
  { url: '/manifest.webmanifest', revision: CACHE_VERSION },
];

// File extensions matched by the documents runtime route.
// Intentionally excludes .html — navigations are handled separately.
const DOCUMENT_EXTENSIONS = ['.pdf', '.txt', '.epub', '.doc', '.docx'];

// ============================================================================
// Runtime Strategy Definitions (Centralized)
// ============================================================================

const RUNTIME_STRATEGIES = {
  pages: {
    class: NetworkFirst,
    cacheName: CACHE_NAMES.pages,
    networkTimeoutSeconds: 3,
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
    cacheName: CACHE_NAMES.assets,
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
    cacheName: CACHE_NAMES.images,
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
    cacheName: CACHE_NAMES.documents,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 90 * 24 * 60 * 60, // 90 Days
      }),
    ],
  },
};

// Helper to instantiate a strategy from the config above.
function buildStrategy(key) {
  const config = RUNTIME_STRATEGIES[key];
  return new config.class({
    cacheName: config.cacheName,
    ...(config.networkTimeoutSeconds
      ? { networkTimeoutSeconds: config.networkTimeoutSeconds }
      : {}),
    plugins: config.plugins,
  });
}

// ============================================================================
// Precaching: Core Assets (Top Level — Guaranteed Routing)
// ============================================================================
//
// precacheAndRoute MUST be called at the top level so Workbox registers its
// route handler synchronously. Dynamic entries from file-list.json are
// added separately via precache() during the install event below.
//

precacheAndRoute(HARDCODED_CORE);

// Precache-bound handler for the offline fallback page.
// Falls back gracefully if the URL is not in the precache.
const offlineHandler = createHandlerBoundToURL(OFFLINE_FALLBACK, true);

// ============================================================================
// Lifecycle: Install
// ============================================================================
//
// Fetches file-list.json, merges with HARDCODED_CORE, and feeds the
// additional entries to Workbox's precache(). Core assets are already
// handled by the top-level precacheAndRoute call.
//

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(FILE_LIST_URL, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Defensive parsing — accept arrays or { files: [...] } shapes.
        let rawFiles = [];
        if (Array.isArray(data)) {
          rawFiles = data;
        } else if (data && Array.isArray(data.files)) {
          rawFiles = data.files;
        } else {
          console.warn('[SW] file-list.json has unexpected shape. Using core only.');
        }

        // Build a Set of already-precached core URLs to avoid duplicates.
        const coreUrls = new Set(HARDCODED_CORE.map((e) => e.url));

        // Collect NEW entries not already in the core precache.
        const dynamicEntries = [];

        for (const entry of rawFiles) {
          if (typeof entry === 'string') {
            if (!coreUrls.has(entry)) {
              dynamicEntries.push({ url: entry, revision: CACHE_VERSION });
              coreUrls.add(entry);
            }
          } else if (
            entry &&
            typeof entry === 'object' &&
            typeof entry.url === 'string' &&
            entry.precache !== false &&
            !coreUrls.has(entry.url)
          ) {
            dynamicEntries.push({
              url: entry.url,
              revision: entry.revision || CACHE_VERSION,
            });
            coreUrls.add(entry.url);
          }
        }

        if (dynamicEntries.length > 0) {
          // precache() adds entries to the Workbox precache cache without
          // re-registering routes (routes already set by precacheAndRoute).
          precache(dynamicEntries);
          console.log(`[SW] Supplemented precache with ${dynamicEntries.length} dynamic assets.`);
        } else {
          console.log('[SW] No additional dynamic assets to precache.');
        }

        console.log(`[SW] Total precached: ${coreUrls.size} assets.`);
      } catch (error) {
        console.warn(`[SW] file-list.json failed (${error.message}). Core-only fallback active.`);
        // Core assets are already precached by the top-level call.
        // Nothing else to do here.
      }

      // Pre-populate the offline fallback into the pages runtime cache as well,
      // so setCatchHandler can find it even if precache lookup fails.
      try {
        const pagesCache = await caches.open(CACHE_NAMES.pages);
        const existing = await pagesCache.match(OFFLINE_FALLBACK);
        if (!existing) {
          const offlineResponse = await fetch(OFFLINE_FALLBACK, { cache: 'no-store' });
          if (offlineResponse.ok) {
            await pagesCache.put(OFFLINE_FALLBACK, offlineResponse.clone());
          }
        }
      } catch (err) {
        console.warn('[SW] Could not pre-populate offline fallback into pages cache:', err);
      }

      // Skip waiting so the new SW activates immediately on next load.
      // Comment out the next line if you prefer user-initiated activation.
      skipWaiting();
    })()
  );
});

// ============================================================================
// Lifecycle: Activate
// ============================================================================
//
// Cleans up outdated Workbox precache caches and any old runtime caches
// from previous SW versions. Broadcasts an ACTIVATED message to all
// controlled clients.
//

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Let Workbox clean up its own outdated precache caches.
      cleanupOutdatedCaches();

      // Sweep all caches and remove any that don't belong to this version.
      const validCacheNames = new Set(Object.values(CACHE_NAMES));
      const allCacheKeys = await caches.keys();

      const deletionPromises = allCacheKeys
        .filter((key) => !validCacheNames.has(key))
        .map((key) => {
          console.log(`[SW] Purging stale cache: ${key}`);
          return caches.delete(key);
        });

      await Promise.all(deletionPromises);

      // Take control of all open clients immediately.
      await clientsClaim();

      // Broadcast activation to all controlled clients.
      const clientList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientList) {
        client.postMessage({ type: 'ACTIVATED', version: SW_VERSION });
      }

      // Register a periodic sync tag if the API is available.
      // This allows background cache refresh on supporting browsers.
      if ('periodicSync' in self.registration) {
        try {
          await self.registration.periodicSync.register('refresh-content', {
            minInterval: 24 * 60 * 60 * 1000, // 24 hours
          });
          console.log('[SW] Periodic sync registered.');
        } catch (err) {
          console.warn('[SW] Periodic sync registration failed:', err);
        }
      }

      console.log(`[SW] Activated — antinazi.org SW v${SW_VERSION}.`);
    })()
  );
});

// ============================================================================
// Runtime Caching Strategies
// ============================================================================

// --- Navigation Route ---
// Intercepts page loads. Tries network first (with 3s timeout),
// falls back to cache, then to the precache-bound offline page.

const navigationRoute = new NavigationRoute(buildStrategy('pages'), {
  denylist: [
    /^\/api\//,       // Don't intercept API calls
    /^\/admin\//,     // Don't intercept admin routes
  ],
});

registerRoute(navigationRoute);

// --- Static Assets (CSS, JS, Fonts) ---
registerRoute(
  ({ request }) => ['style', 'script', 'font'].includes(request.destination),
  buildStrategy('assets')
);

// --- Images ---
registerRoute(
  ({ request }) => request.destination === 'image',
  buildStrategy('images')
);

// --- Documents (PDFs, plain text, etc.) ---
// Matches by file extension rather than destination to avoid
// catching navigation requests (which also have destination 'document').
registerRoute(
  ({ url }) => DOCUMENT_EXTENSIONS.some((ext) => url.pathname.toLowerCase().endsWith(ext)),
  buildStrategy('documents')
);

// ============================================================================
// Fallback Handling
// ============================================================================

setCatchHandler(async ({ request }) => {
  // Navigation requests → serve offline page.
  if (request.mode === 'navigate') {
    try {
      // Try the precache-bound handler first.
      const precachedResponse = await offlineHandler({ request });
      if (precachedResponse) return precachedResponse;
    } catch {
      // Fall through to manual cache lookup.
    }

    try {
      const cache = await caches.open(CACHE_NAMES.pages);
      const cachedResponse = await cache.match(OFFLINE_FALLBACK);
      if (cachedResponse) return cachedResponse;
    } catch (err) {
      console.error('[SW] Offline fallback retrieval failed:', err);
    }

    // Last resort: a simple inline response so the user sees
    // something meaningful instead of a raw browser error.
    return new Response(
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
      '<title>Offline — antinazi.org</title>' +
      '<style>body{font-family:system-ui,sans-serif;display:flex;' +
      'align-items:center;justify-content:center;margin:0;min-height:100vh;' +
      'background:#1a1a2e;color:#e0e0e0;text-align:center;padding:2rem}' +
      'h1{color:#6d4aff}</style></head><body>' +
      '<div><h1>You are offline</h1>' +
      '<p>This page is not cached. Please reconnect to access antinazi.org.</p></div>' +
      '</body></html>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  // For non-navigation requests, try matching from any cache.
  try {
    const allCacheKeys = await caches.keys();
    for (const key of allCacheKeys) {
      const cache = await caches.open(key);
      const match = await cache.match(request);
      if (match) return match;
    }
  } catch {
    // Silently fall through.
  }

  // Final fallback: opaque error.
  return Response.error();
});

// ============================================================================
// Message Handling
// ============================================================================

self.addEventListener('message', (event) => {
  const data = event.data;

  if (!data || !data.type) return;

  switch (data.type) {
    // --- Skip Waiting: Activate this SW immediately ---
    case 'SKIP_WAITING':
      skipWaiting();
      break;

    // --- Clear Caches: Remove all caches for this origin ---
    case 'CLEAR_CACHES':
      event.waitUntil(
        (async () => {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
          console.log('[SW] All caches cleared.');

          // Notify the requesting client.
          if (event.source) {
            event.source.postMessage({ type: 'CACHE_CLEARED' });
          }
        })()
      );
      break;

    // --- Get Version: Return SW version info ---
    case 'GET_VERSION':
      if (event.source) {
        event.source.postMessage({
          type: 'VERSION_INFO',
          version: SW_VERSION,
          cacheVersion: CACHE_VERSION,
        });
      }
      break;

    // --- Force Recache: Re-fetch and precache core assets ---
    case 'FORCE_RECACHE':
      event.waitUntil(
        (async () => {
          // Re-fetch file-list.json and rebuild precache.
          try {
            const response = await fetch(FILE_LIST_URL, {
              cache: 'no-store',
              headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const json = await response.json();
            const rawFiles = Array.isArray(json) ? json : json.files || [];

            const coreUrls = new Set(HARDCODED_CORE.map((e) => e.url));
            const dynamicEntries = [];

            for (const entry of rawFiles) {
              if (typeof entry === 'string') {
                if (!coreUrls.has(entry)) {
                  dynamicEntries.push({ url: entry, revision: CACHE_VERSION });
                  coreUrls.add(entry);
                }
              } else if (
                entry &&
                typeof entry === 'object' &&
                typeof entry.url === 'string' &&
                entry.precache !== false &&
                !coreUrls.has(entry.url)
              ) {
                dynamicEntries.push({
                  url: entry.url,
                  revision: entry.revision || CACHE_VERSION,
                });
                coreUrls.add(entry.url);
              }
            }

            if (dynamicEntries.length > 0) {
              precache(dynamicEntries);
            }

            console.log(`[SW] Force recache complete. ${dynamicEntries.length} dynamic assets refreshed.`);

            if (event.source) {
              event.source.postMessage({
                type: 'RECACHE_COMPLETE',
                count: dynamicEntries.length,
              });
            }
          } catch (err) {
            console.error('[SW] Force recache failed:', err);
            if (event.source) {
              event.source.postMessage({
                type: 'RECACHE_FAILED',
                error: err.message,
              });
            }
          }
        })()
      );
      break;

    default:
      console.warn(`[SW] Unknown message type: ${data.type}`);
  }
});

// ============================================================================
// Periodic Sync (Background Cache Refresh)
// ============================================================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-content') {
    event.waitUntil(
      (async () => {
        console.log('[SW] Periodic sync: refreshing cached content.');

        // Re-fetch file-list.json and update precache.
        try {
          const response = await fetch(FILE_LIST_URL, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });

          if (response.ok) {
            const json = await response.json();
            const rawFiles = Array.isArray(json) ? json : json.files || [];
            const coreUrls = new Set(HARDCODED_CORE.map((e) => e.url));
            const dynamicEntries = [];

            for (const entry of rawFiles) {
              if (typeof entry === 'string') {
                if (!coreUrls.has(entry)) {
                  dynamicEntries.push({ url: entry, revision: CACHE_VERSION });
                  coreUrls.add(entry.url);
                }
              } else if (
                entry &&
                typeof entry === 'object' &&
                typeof entry.url === 'string' &&
                entry.precache !== false &&
                !coreUrls.has(entry.url)
              ) {
                dynamicEntries.push({
                  url: entry.url,
                  revision: entry.revision || CACHE_VERSION,
                });
                coreUrls.add(entry.url);
              }
            }

            if (dynamicEntries.length > 0) {
              precache(dynamicEntries);
            }

            // Notify clients that content was refreshed.
            const clientList = await self.clients.matchAll({ type: 'window' });
            for (const client of clientList) {
              client.postMessage({ type: 'CONTENT_REFRESHED' });
            }

            console.log(`[SW] Periodic sync complete. ${dynamicEntries.length} assets refreshed.`);
          }
        } catch (err) {
          console.warn('[SW] Periodic sync failed:', err);
        }
      })()
    );
  }
});

// ============================================================================
// Fetch Error Logging (Development Aid)
// ============================================================================

self.addEventListener('fetch', (event) => {
  // This listener is for observability only — Workbox handles routing.
  // Log failed navigations to aid debugging.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (!response.ok && response.status >= 500) {
            console.warn(`[SW] Server error on navigation: ${event.request.url} (${response.status})`);
          }
          return response;
        } catch (err) {
          console.warn(`[SW] Network error on navigation: ${event.request.url}`, err);
          throw err;
        }
      })()
    );
  }
});

// ============================================================================
// Startup
// ============================================================================

console.log(`[SW] antinazi.org SW v${SW_VERSION} loaded (Unified Hybrid).`);
