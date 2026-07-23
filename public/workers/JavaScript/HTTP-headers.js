/**
 * Security Headers Worker for antiNazi.org
 * Deploy via Cloudflare Dashboard → Workers & Pages → Create Worker
 * Then attach route: antinazi.org/*
 */

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "base-uri 'none'; child-src 'none'; connect-src 'self'; default-src 'none'; fenced-frame-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'self'; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; upgrade-insecure-requests; worker-src 'self'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy":
    "accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(), battery=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), interest-cohort=(), join-ad-interest-group=(), keyboard-map=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), private-state-token-issuance=(), private-state-token-redemption=(), publickey-credentials-get=(), run-ad-auction=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()",
  "X-XSS-Protection": "0",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-site",
  "Cross-Origin-Resource-Policy": "same-site"
};

const BLOCKED_HEADERS = ["Public-Key-Pins", "X-Powered-By", "X-AspNet-Version"];

async function handleRequest(request) {
  const response = await fetch(request);

  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }

  for (const header of BLOCKED_HEADERS) {
    newHeaders.delete(header);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
