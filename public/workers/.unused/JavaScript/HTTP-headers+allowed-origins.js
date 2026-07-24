// worker.js — Combined Security Headers + Dynamic CORS Worker
// Updated: COOP and CORP set to same-origin (stricter isolation)
// STS: 2 years (max-age=63072000), COEP: require-corp

const ALLOWED_ORIGINS = [
  'https://antinazi.org',
  'https://www.antinazi.org',
  // Add subdomains or CDN origins as needed
];

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'attribution-reporting=()',
    'autoplay=()',
    'battery=()',
    'browsing-topics=()',
    'camera=()',
    'clipboard-read=()',
    'clipboard-write=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=(self)',
    'gamepad=()',
    'geolocation=()',
    'gyroscope=()',
    'hid=()',
    'identity-credentials-get=()',
    'idle-detection=()',
    'interest-cohort=()',
    'join-ad-interest-group=()',
    'keyboard-map=()',
    'local-fonts=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'navigation-override=()',
    'payment=()',
    'picture-in-picture=()',
    'private-state-token-issuance=()',
    'private-state-token-redemption=()',
    'publickey-credentials-get=()',
    'run-ad-auction=()',
    'screen-wake-lock=()',
    'serial=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'window-management=()',
    'xr-spatial-tracking=()'
  ].join(', '),
  'Content-Security-Policy': [
    "default-src 'none'",
    "base-uri 'none'",
    "child-src 'none'",
    "connect-src 'self' https://cdn.jsdelivr.net",
    "fenced-frame-src 'none'",
    "font-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    "upgrade-insecure-requests",
    "worker-src 'self' https://cdn.jsdelivr.net"
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0'
};

// MIME type overrides for specific extensions
const MIME_OVERRIDES = {
  '.webmanifest': 'application/manifest+json',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle preflight OPTIONS requests early
    if (request.method === 'OPTIONS') {
      const requestOrigin = request.headers.get('Origin');

      const preflightHeaders = new Headers();

      // Copy relevant incoming headers
      preflightHeaders.set(
        'Access-Control-Allow-Methods',
        'GET, HEAD, OPTIONS'
      );
      preflightHeaders.set(
        'Access-Control-Allow-Headers',
        'Content-Type'
      );
      preflightHeaders.set('Access-Control-Max-Age', '86400');

      if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
        preflightHeaders.set(
          'Access-Control-Allow-Origin',
          requestOrigin
        );
        preflightHeaders.append('Vary', 'Origin');
      }

      // Apply security headers to preflight too
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        preflightHeaders.set(key, value);
      }

      return new Response(null, {
        status: 204,
        headers: preflightHeaders
      });
    }

    // Fetch the original resource
    const response = await fetch(request);

    // Clone the response so we can modify headers
    const modifiedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });

    // Apply security headers
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      modifiedResponse.headers.set(key, value);
    }

    // Apply MIME type overrides based on file extension
    for (const [ext, mimeType] of Object.entries(MIME_OVERRIDES)) {
      if (url.pathname.endsWith(ext)) {
        modifiedResponse.headers.set('Content-Type', mimeType);
        break;
      }
    }

    // --- Dynamic CORS (multi-origin reflection) ---
    const requestOrigin = request.headers.get('Origin');

    if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
      modifiedResponse.headers.set(
        'Access-Control-Allow-Origin',
        requestOrigin
      );
      modifiedResponse.headers.set(
        'Access-Control-Allow-Methods',
        'GET, HEAD, OPTIONS'
      );
      modifiedResponse.headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type'
      );
      modifiedResponse.headers.set(
        'Access-Control-Max-Age',
        '86400'
      );
      modifiedResponse.headers.append('Vary', 'Origin');
    }

    return modifiedResponse;
  }
};
