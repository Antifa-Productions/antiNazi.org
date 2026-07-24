// worker.js — Combined Security Headers + Dynamic CORS Worker
// Final version: COOP/COEP strict, dynamic ACAO, proper Vary, Nel/Report-To deleted

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
  'X-XSS-Protection': '0',
  'Cache-Control': 'no-cache, no-transform'
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

    // ============================================
    // Handle preflight OPTIONS requests
    // ============================================
    if (request.method === 'OPTIONS') {
      const requestOrigin = request.headers.get('Origin');

      const preflightHeaders = new Headers();

      // Preflight-only CORS headers
      preflightHeaders.set(
        'Access-Control-Allow-Methods',
        'GET, HEAD, OPTIONS'
      );
      preflightHeaders.set(
        'Access-Control-Allow-Headers',
        'Content-Type'
      );
      preflightHeaders.set('Access-Control-Max-Age', '86400');

      // Always append Vary: Origin
      preflightHeaders.append('Vary', 'Origin');

      // ACAO only if origin is allowed
      if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
        preflightHeaders.set(
          'Access-Control-Allow-Origin',
          requestOrigin
        );
      }

      // Delete Cloudflare's Nel and Report-To
      preflightHeaders.delete('Nel');
      preflightHeaders.delete('Report-To');

      // Apply security headers to preflight too
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        preflightHeaders.set(key, value);
      }

      return new Response(null, {
        status: 204,
        headers: preflightHeaders
      });
    }

    // ============================================
    // Handle regular GET/HEAD requests
    // ============================================

    // Fetch the original resource
    const response = await fetch(request);

    // Clone the response so we can modify headers
    const modifiedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });

    // Remove any existing ACAO header from upstream/dashboard
    modifiedResponse.headers.delete('Access-Control-Allow-Origin');

    // Delete Cloudflare's Nel and Report-To headers
    modifiedResponse.headers.delete('Nel');
    modifiedResponse.headers.delete('Report-To');

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

    // ============================================
    // Dynamic CORS (multi-origin reflection)
    // ============================================

    // Always append Vary: Origin so caches know responses differ by origin
    modifiedResponse.headers.append('Vary', 'Origin');

    const requestOrigin = request.headers.get('Origin');

    if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
      modifiedResponse.headers.set(
        'Access-Control-Allow-Origin',
        requestOrigin
      );

      // Expose-Headers: Uncomment if JS needs to read non-safelisted response headers
      // Safe-listed headers (always readable by JS): Cache-Control, Content-Language,
      // Content-Length, Content-Type, Expires, Last-Modified, Pragma
      // modifiedResponse.headers.set(
      //   'Access-Control-Expose-Headers',
      //   'Content-Length, X-Custom-Header'
      // );
    }

    return modifiedResponse;
  }
};
