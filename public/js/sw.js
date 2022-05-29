self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(cacheName).then(function (cache) {
            return cache.addAll(
                [
                    '/static/index.html',
                    '/css/style_2.css',
                    '/js/sw.js',
                    '/lit/index.html',
                    'apple-touch-icon.png',
                    'touch-icon-ipad-retina.png',
                    'touch-icon-iphone-retina.png',
                    'favicon.png',
                    'favicon.ico',
                    'index.html',
                    'manifest.json',
                    'https://cdn.iosprivacy.com/AntiNaziTwitter.png',
                ]
            );
        })
    );
});
