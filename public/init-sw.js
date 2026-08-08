/**
 * Service Worker Initialization — antinazi.org
 * Version: 2.5
 *
 * Purpose:
 * - Register and activate the service worker
 * - Handle SW lifecycle events (waiting, activated, updated)
 * - Provide a Promise-based API for SW interactions
 * - Manage client communication via postMessage
 *
 * Usage:
 *   import { initServiceWorker } from '/sw-init.js';
 *   const sw = await initServiceWorker();
 *   sw.on('updateAvailable', () => { ... });
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  SW_PATH: '/sw.js',                          // Path to your service worker file
  DEBUG: true,                                // Enable debug logging
  WAIT_FOR_ACTIVATION: true,                  // Wait for SW to be fully active
  AUTO_SKIP_WAITING: true,                    // Auto-activate when available
  CHECK_UPDATE_INTERVAL_MS: 60 * 60 * 1000,   // Check for SW updates hourly
  MESSAGE_TIMEOUT_MS: 10000,                  // Timeout for message responses
  FALLBACK_TIMEOUT_MS: 30000,                 // Max wait time for registration
};

// ============================================================================
// Global State
// ============================================================================

let controller = null;                        // The active ServiceWorker instance
let isRegistered = false;                     // Registration completion flag
const eventListeners = {};                    // Custom event subscriber map

// Event types we listen for from the SW
const SW_EVENTS = [
  'ACTIVATED',
  'UPDATE_AVAILABLE',
  'CACHE_CLEARED',
  'VERSION_INFO',
  'RECACHE_COMPLETE',
  'RECACHE_FAILED',
  'CONTENT_REFRESHED',
];

// ============================================================================
// Logger Utility
// ============================================================================

const logger = {
  prefix: '[SW-Init]',
  enabled: CONFIG.DEBUG,
  
  log(...args) {
    if (!this.enabled) return;
    console.log(this.prefix, ...args);
  },
  
  warn(...args) {
    if (!this.enabled) return;
    console.warn(this.prefix, ...args);
  },
  
  error(...args) {
    console.error(this.prefix, ...args);
  },
  
  info(...args) {
    if (!this.enabled) return;
    console.info(this.prefix, ...args);
  },
};

// ============================================================================
// Message Handling Utilities
// ============================================================================

/**
 * Send a message to the service worker and wait for a response.
 * Returns a Promise that resolves when the SW replies, or rejects on timeout.
 */
function sendMessage(message, expectedType = null) {
  return new Promise((resolve, reject) => {
    if (!controller) {
      reject(new Error('No service worker controller available'));
      return;
    }

    let timeoutId = null;
    let cleanup = null;

    // Set up a one-time message listener for the response
    cleanup = (event) => {
      const data = event.data;
      if (!data || !data.type) return;
      
      if (expectedType && data.type !== expectedType) return;
      
      clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener('message', cleanup);
      
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data);
      }
    };

    navigator.serviceWorker.addEventListener('message', cleanup);

    // Timeout protection
    timeoutId = setTimeout(() => {
      if (cleanup) {
        navigator.serviceWorker.removeEventListener('message', cleanup);
      }
      reject(new Error(`Message timeout after ${CONFIG.MESSAGE_TIMEOUT_MS}ms`));
    }, CONFIG.MESSAGE_TIMEOUT_MS);

    controller.postMessage(message);
  });
}

/**
 * Wait for the service worker to reach a specific state.
 */
function waitForState(state, timeoutMs = CONFIG.FALLBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker?.controller) {
      reject(new Error('No service worker controller'));
      return;
    }

    const sw = navigator.serviceWorker.controller;

    if (sw.state === state) {
      resolve(sw);
      return;
    }

    let cleanup = null;
    let timeoutId = null;

    cleanup = () => {
      clearTimeout(timeoutId);
      sw.removeEventListener('statechange', onStateChange);
    };

    onStateChange = () => {
      if (sw.state === state) {
        cleanup();
        resolve(sw);
      } else if (sw.state === 'redundant') {
        cleanup();
        reject(new Error('Service worker became redundant'));
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for SW state: ${state}`));
    }, timeoutMs);

    sw.addEventListener('statechange', onStateChange);
  });
}

// ============================================================================
// Public API — Event System
// ============================================================================

/**
 * Subscribe to service worker lifecycle events.
 * 
 * @param {string} event - Event name (see SW_EVENTS)
 * @param {Function} handler - Callback function
 * @returns {Object} Unsubscribe function
 */
function on(event, handler) {
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(handler);

  logger.log(`Subscribed to "${event}"`);

  return {
    unsubscribe: () => {
      const idx = eventListeners[event]?.indexOf(handler);
      if (idx !== undefined && idx !== -1) {
        eventListeners[event].splice(idx, 1);
        logger.log(`Unsubscribed from "${event}"`);
      }
    },
  };
}

/**
 * Dispatch an internal event to all subscribers.
 */
function dispatchEvent(name, payload) {
  const handlers = eventListeners[name] || [];
  logger.log(`Dispatching "${name}" to ${handlers.length} handlers`);
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      logger.error(`Handler for "${name}" threw error:`, err);
    }
  });
}

// ============================================================================
// Public API — SW Interactions
// ============================================================================

/**
 * Request the SW to skip waiting and activate immediately.
 */
async function skipWaiting() {
  if (!controller) {
    throw new Error('No service worker controller');
  }

  logger.log('Skipping waiting...');
  controller.postMessage({ type: 'SKIP_WAITING' });
  
  await waitForState('activated');
  logger.log('Service worker skipped waiting and activated');
}

/**
 * Get version info from the service worker.
 */
async function getVersion() {
  const response = await sendMessage({ type: 'GET_VERSION' }, 'VERSION_INFO');
  return {
    swVersion: response.version,
    cacheVersion: response.cacheVersion,
  };
}

/**
 * Clear all caches managed by the service worker.
 */
async function clearCaches() {
  const response = await sendMessage({ type: 'CLEAR_CACHES' }, 'CACHE_CLEARED');
  logger.log('All caches cleared');
  return response;
}

/**
 * Force the service worker to re-fetch and precache assets.
 */
async function forceRecache() {
  const response = await sendMessage({ type: 'FORCE_RECACHE' }, null);
  // The response could be RECACHE_COMPLETE or RECACHE_FAILED
  return response;
}

/**
 * Manually check if a new service worker version is available.
 */
async function checkForUpdate() {
  if (!controller) {
    logger.log('No controller to check for updates');
    return false;
  }

  logger.log('Checking for service worker update...');
  const registration = await navigator.serviceWorker.getRegistration();
  
  // Trigger a re-registration which will compare with the server
  await navigator.serviceWorker.ready;
  
  // Force the browser to fetch the latest SW file
  if (registration) {
    await registration.update();
    
    // Check if there's a waiting worker
    if (registration.waiting) {
      logger.log('New service worker version available');
      dispatchEvent('UPDATE_AVAILABLE', {
        waiting: registration.waiting,
        current: controller,
      });
      return true;
    }
  }
  
  logger.log('No service worker update found');
  return false;
}

/**
 * Apply a pending update (skip waiting on a waiting SW).
 */
async function applyUpdate() {
  const registration = await navigator.serviceWorker.getRegistration();
  
  if (!registration?.waiting) {
    throw new Error('No waiting service worker to activate');
  }

  logger.log('Applying service worker update...');
  
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  
  await waitForState('activated', 30000);
  logger.log('Service worker update applied');
}

/**
 * Get the current service worker version and status.
 */
function getStatus() {
  return {
    registered: isRegistered,
    hasController: !!controller,
    controllerState: controller?.state || null,
    eventCount: Object.keys(eventListeners).length,
  };
}

// ============================================================================
// Core Registration Flow
// ============================================================================

/**
 * Main initialization function.
 * Registers the service worker and sets up lifecycle listeners.
 * 
 * @returns {Promise<Object>} SW instance with methods and event emitter
 */
async function initServiceWorker() {
  logger.log(`Initializing Service Worker: ${CONFIG.SW_PATH}`);

  if (!('serviceWorker' in navigator)) {
    logger.error('Service Workers not supported in this browser');
    throw new Error('Service Workers not supported');
  }

  // Prevent double registration
  if (isRegistered) {
    logger.log('Service Worker already registered, returning existing instance');
    return {
      controller,
      on,
      skipWaiting,
      getVersion,
      clearCaches,
      forceRecache,
      checkForUpdate,
      applyUpdate,
      getStatus,
    };
  }

  try {
    // Register the service worker
    const registration = await navigator.serviceWorker.register(CONFIG.SW_PATH, {
      scope: '/',
    });

    logger.log(`Service Worker registered: ${registration.scope}`);
    controller = registration.installing || registration.active;

    // Handle the controller's state changes
    if (controller?.state === 'installed') {
      // New SW installed but not yet active
      if (CONFIG.AUTO_SKIP_WAITING) {
        logger.log('Auto-skipping waiting for new service worker');
        controller.postMessage({ type: 'SKIP_WAITING' });
      }
    }

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || !data.type) return;

      logger.log('Received message from SW:', data.type, data);
      dispatchEvent(data.type, data);
    });

    // Handle updates while the page is running
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logger.log('Controller changed');
      
      // Update our reference to the new controller
      navigator.serviceWorker.getRegistration().then((reg) => {
        controller = reg?.active || reg?.waiting;
        
        if (controller?.state !== 'activated') {
          waitForState('activated').then(() => {
            dispatchEvent('ACTIVATED', { controller });
          }).catch(logger.error);
        } else {
          dispatchEvent('ACTIVATED', { controller });
        }
      });
    });

    // Wait for initial activation if configured
    if (CONFIG.WAIT_FOR_ACTIVATION) {
      await waitForState('activated');
    }

    // Ensure we have a reference to the active controller
    if (!controller) {
      const reg = await navigator.serviceWorker.ready;
      controller = reg.active;
    }

    isRegistered = true;
    logger.log(`Service Worker initialized successfully (v${controller?.state})`);

    // Start periodic update checks if desired
    startUpdateChecker();

    // Return the public API
    return {
      controller,
      on,
      skipWaiting,
      getVersion,
      clearCaches,
      forceRecache,
      checkForUpdate,
      applyUpdate,
      getStatus,
    };
  } catch (err) {
    logger.error('Failed to initialize service worker:', err);
    throw err;
  }
}

/**
 * Start periodic checks for service worker updates.
 */
function startUpdateChecker() {
  if (CONFIG.CHECK_UPDATE_INTERVAL_MS <= 0) {
    logger.log('Update checking disabled');
    return;
  }

  logger.log(`Starting update checker (interval: ${CONFIG.CHECK_UPDATE_INTERVAL_MS / 1000}s)`);

  // Check immediately on startup
  checkForUpdate().catch(logger.warn);

  // Then check periodically
  setInterval(() => {
    checkForUpdate().catch((err) => {
      logger.warn('Periodic update check failed:', err);
    });
  }, CONFIG.CHECK_UPDATE_INTERVAL_MS);
}

// ============================================================================
// Window Load Handler (for non-ES Module environments)
// ============================================================================

// If this script is loaded via a <script> tag (not ES module),
// auto-initialize when the window loads.
if (typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    if (!window.initServiceWorkerReady) {
      try {
        window.swAPI = await initServiceWorker();
        window.initServiceWorkerReady = true;
        logger.log('SW API exposed on window.swAPI');
      } catch (err) {
        logger.error('Failed to auto-initialize SW:', err);
      }
    }
  });
}

// Export for ES module usage
export {
  initServiceWorker,
  on,
  skipWaiting,
  getVersion,
  clearCaches,
  forceRecache,
  checkForUpdate,
  applyUpdate,
  getStatus,
  sendMessage,
  waitForState,
  logger,
  CONFIG,
};
