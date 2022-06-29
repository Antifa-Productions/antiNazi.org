self.addEventListener('install', function (n) {
  n.waitUntil(caches.open('v3').then(function (n) {
    return n.addAll(['/',
    '/index.html',
    '/css/',
    '/icons/',
    '/img/',
    '/js/',
    '/touch-icon-ipad-retina.png',
    '/touch-icon-iphone-retina.png',
    '/apple-touch-icon.png',
    '/favicon.png',
    '/favicon.svg',
    '/favicon.ico',
    '/sw.js',
    '/manifest.webmanifest'])
  }))
});
