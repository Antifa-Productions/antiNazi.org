// init-sw-idb.js - Service Worker Registration Script
// Loads as: <script type="module" src="/init-sw-idb.js" integrity="sha384-XXX" crossorigin="anonymous"></script>

if ('serviceWorker' in navigator) {
  const initSw = async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        '/sw-idb.mjs',
        {
          scope: '/',
          type: 'module',  // ← ES MODULE SERVICE WORKER
          updateViaCache: 'none',
        }
      );
      console.log('[APP] SW registered:', registration.scope);

      // --- Update Handling -------------------------------------------------
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            console.log('[APP] New SW version installed; activation pending.');
          }
        });
      });

      // Periodic update check (every 60 minutes)
      setInterval(() => {
        registration.update().catch((err) => {
          console.warn('[APP] Periodic update check failed:', err);
        });
      }, 60 * 60 * 1000);

    } catch (err) {
      console.error('[APP] SW registration failed:', err);
    }
  };

  // --- Reload on Controller Change -----------------------------------------
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  // --- Page ↔ SW Message Channel -------------------------------------------
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, data } = event.data ?? {};

    switch (type) {
      case 'SYNC_STATUS':
        console.log('[APP] Pending sync requests:', data?.pendingCount ?? 0);
        break;
      case 'PRECACHE_METADATA':
        console.log('[APP] Precache metadata:', data);
        break;
      case 'BG_SYNC_COMPLETE':
        console.log('[APP] Background sync complete.');
        break;
    }
  });

  // --- Kick Off Registration -----------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSw);
  } else {
    initSw();
  }

  // --- Helper: Query Pending Retries ---------------------------------------
  function queryPendingRetries() {
    const sw = navigator.serviceWorker.controller;
    if (!sw) {
      console.warn('[APP] No active controller to query.');
      return;
    }
    sw.postMessage({ type: 'QUERY_SYNC_STATUS' });
  }

  // --- Helper: Request Manual Retry ----------------------------------------
  function requestManualRetry() {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return;
    sw.postMessage({ type: 'TRIGGER_RETRY' });
  }

  // Expose helpers globally for manual testing/debugging
  window.swQueryPendingRetries = queryPendingRetries;
  window.swRequestManualRetry = requestManualRetry;
}