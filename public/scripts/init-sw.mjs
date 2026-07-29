// init-sw.mjs - Service Worker Registration Script
// Loads as: <script type="module" src="/scripts/init-sw.mjs"></script>
if ('serviceWorker' in navigator) {
  const initSw = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.mjs', {
        scope: '/',
        type: 'module',
        updateViaCache: 'none',
      });
      console.log('[APP] SW registered:', registration.scope);
      // --- Update Handling -------------------------------------------------
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
    const {
      type,
      data
    } = event.data ?? {};
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
      case 'PONG':
        console.log('[APP] SW responded to PING.');
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
    sw.postMessage({
      type: 'QUERY_SYNC_STATUS'
    });
  }
  // --- Helper: Request Manual Retry ----------------------------------------
  function requestManualRetry() {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return;
    sw.postMessage({
      type: 'TRIGGER_RETRY'
    });
  }
  // Expose helpers globally for manual testing/debugging
  window.swQueryPendingRetries = queryPendingRetries;
  window.swRequestManualRetry = requestManualRetry;
}
// Update listener — add to init-sw-idb.mjs or inline in <head>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
      showUpdateBanner(event.data.currentVersion, event.data.newVersion);
    }
  });
  navigator.serviceWorker.ready.then((registration) => {
    // Manual check trigger (e.g., from a settings menu)
    // registration.active.postMessage({ type: 'CHECK_FOR_UPDATES' });
  });
}

function showUpdateBanner(currentVersion, newVersion) {
  // Prevent duplicate banners
  if (document.getElementById('sw-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = `
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: #1a1a2e;
    color: #e0e0e0;
    border: 1px solid #6d4aff;
    border-radius: 8px;
    font-family: system-ui, "Liberation Sans", "Fira Sans", "Open Sans", "Source Sans Pro", arial, sans-serif;
    font-size: 0.875rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: calc(100vw - 2rem);
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  const text = document.createElement('span');
  text.textContent = `Content updated (${newVersion}). Refresh to see latest.`;
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.style.cssText = `
    background: #6d4aff;
    color: white;
    border: none;
    padding: 0.4rem 0.9rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
  `;
  refreshBtn.addEventListener('click', () => {
    // Tell the SW to skip waiting, then reload
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg && reg.waiting) {
        reg.waiting.postMessage({
          type: 'SKIP_WAITING'
        });
      }
    });
    window.location.reload();
  });
  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notice');
  dismissBtn.style.cssText = `
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.25rem;
    line-height: 1;
  `;
  dismissBtn.addEventListener('click', () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  });
  banner.appendChild(text);
  banner.appendChild(refreshBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
  // Fade in
  requestAnimationFrame(() => {
    banner.style.opacity = '1';
  });
  // Auto-dismiss after 30 seconds (don't leave it hanging forever)
  setTimeout(() => {
    if (document.getElementById('sw-update-banner')) {
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 300);
    }
  }, 30000);
}
