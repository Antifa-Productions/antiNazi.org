if ('serviceWorker' in navigator) {
  // Register as early as possible rather than waiting for full page load.
  // DOMContentLoaded is sufficient — we don't need images/stylesheets finished.
  const initSw = async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        '/sw-idb.js',
        { scope: '/' }
      );
      console.log('[APP] SW registered:', registration.scope);

      // --- Update handling -------------------------------------------------
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // New version downloaded and waiting. The SW calls skipWaiting(),
            // so it will activate shortly — the controllerchange listener
            // below handles the actual reload.
            console.log('[APP] New SW version installed; activation pending.');
          }
        });
      });

      // Periodic update check (every 60 minutes). The browser only checks
      // on navigation by default — this catches updates during long sessions
      // where IDB schema or manifest version may have changed server-side.
      setInterval(() => {
        registration.update().catch((err) => {
          console.warn('[APP] Periodic update check failed:', err);
        });
      }, 60 * 60 * 1000);

    } catch (err) {
      console.error('[APP] SW registration failed:', err);
    }
  };

  // --- Reload on controller change -----------------------------------------
  // When skipWaiting() fires, the new SW takes control. The page must reload
  // to pick up new precached assets and ensure IDB schema compatibility.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return; // Guard against double-firing
    refreshing = true;
    window.location.reload();
  });

  // --- Page ↔ SW message channel for IDB queries ---------------------------
  // Allows the page to ask the SW about IDB-stored data (failed retries,
  // prefetch metadata, etc.) without opening a competing IDB connection.
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, data } = event.data ?? {};

    switch (type) {
      case 'SYNC_STATUS':
        // SW reports pending failed-retries count
        console.log('[APP] Pending sync requests:', data?.pendingCount ?? 0);
        // TODO: surface this in the UI (banner, badge, etc.)
        break;

      case 'PRECACHE_METADATA':
        // SW reports metadata for a specific URL
        console.log('[APP] Precache metadata:', data);
        break;

      case 'BG_SYNC_COMPLETE':
        // Background sync replay finished — could refresh UI state
        console.log('[APP] Background sync complete.');
        break;
    }
  });

  // Kick off registration
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSw);
  } else {
    initSw();
  }

  // --- Helper: query the SW for pending failed retries ---------------------
  // Call this from your UI whenever you want to check if there are
  // unsynced requests sitting in IDB.
  function queryPendingRetries() {
    const sw = navigator.serviceWorker.controller;
    if (!sw) {
      console.warn('[APP] No active controller to query.');
      return;
    }
    sw.postMessage({ type: 'QUERY_SYNC_STATUS' });
  }

  // --- Helper: request manual retry of failed requests ---------------------
  function requestManualRetry() {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return;
    sw.postMessage({ type: 'TRIGGER_RETRY' });
  }
}
