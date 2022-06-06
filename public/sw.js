self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('v4').then(function(Cache) {
      return Cache.addAll([
        '/',
        'index.html',
        '/static/index.html',
        '/lit/',
        '/lit/index.html',
        '/touch-icon-ipad-retina.png',
        '/touch-icon-iphone-retina.png',
        '/apple-touch-icon.png',
        '/favicon.png',
        '/favicon.ico',
        '/icon_x384.png',
        '/icon_x512.png',
        '/icon_x96.png',
        '/icon_x72.png',
        '/icon_x168.png',
        '/icon_x128.png',
        '/icon_x192.png',
        'https://cdn.iosprivacy.com/img/AntiNaziTwitter/png',
        '/sw.js',
        '/manifest.webmanifest',
      ]);
    })
  );
})
