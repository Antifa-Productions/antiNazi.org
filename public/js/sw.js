self.addEventListener('install', function (event) { event.waitUntil(caches.open('v3').then(function (Cache) { return Cache.addAll(['/', 'index.html', '/lit/', '/lit/index.html', 'apple-touch-icon.png', 'touch-icon-ipad-retina.png', 'touch-icon-iphone-retina.png', 'favicon.png', 'icon_x384.png', 'icon_x72.png', 'icon_x96.png', 'icon_x168.png', 'favicon.ico', 'icon_x512.png', 'icon_x192.png', 'https://cdn.iosprivacy.com/img/AntiNaziTwitter.png']) })) });