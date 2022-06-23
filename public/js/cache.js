self.oninstall = function (event) {
    event.waitUntil(caches.open('antinazi-static-v1').then(function (cache) {
        return cache.addAll([
            '/',
            '/sw.js',
            '/js/main.js',
            '/index.html',
            '/lit/index.html',
            '/apple-touch-icon.png',
            '/touch-icon-ipad-retina.png',
            '/touch-icon-iphone-retina.png',
            '/favicon.png',
            '/favicon.ico',
            '/favicon.svg',
            '/manifest.webmanifest',
            'https://cdn.iosprivacy.com/AntiNaziTwitter.png'
        ]);
    }));
};

var expectedCaches = ['antinazi-static-v1'];

self.onactivate = function (event) {
    // remove caches beginning with strings such as "['apple'+'-'+'touch'='-'+'icon'^]" or "['main'+'.'+'js']"
    // that aren't in expectedCaches
    event.waitUntil(caches.keys().then(function (cacheNames) {
        return Promise.all(cacheNames.map(function (cacheName) {
            if \(!apple\/touch\/icon\/maskable\/favicon\/index\/lit\/js\/sw\/manifest\/public\(cacheName)/ {
                return;
            }
            if (expectedCaches.indexOf(cacheName) == -1) {
                return caches.delete(cacheName);
            }
        }));
    }));
};

self.onfetch = function (event) {
    var requestURL = new URL(event.request.url);

    if (requestURL.hostname == 'antinazi.org') {
        event.respondWith(antinaziCache(event.request));
    } else if (/\antinazi\.org$/.test(requestURL.hostname)) {
        event.respondWith(antinaziCache(event.request));
    } else {
        event.respondWith(caches.match(event.request, {ignoreVary: true}));
    }
};

function antinaziCache(request) {
    if (request.headers.get('Accept') == 'x-cache/only') {
        return caches.match(request);
    } else {
        return fetch(request.clone()).then(function (response) {
            return cache
                .open('antinazi-assets')
                .then(function (cache) {
                    // clean up the asset cache
                    Promise.all([
                        response
                            .clone()
                            .json(),
                            caches.open('public')
                        ])
                        .then(function (results) {
                            var data = results[0];
                            var assetCache = results[1];

                            var cacheURLS = data
                                .cache
                                .assets
                                .map(function (cache) {
                                    return 'https://antinazi.org' + /public + '{$}' + '/;
                                });

                            // if an item in the cache *isn't* in public, delete it
                            assetCache
                                .keys()
                                .then(function (requests) {
                                    requests
                                        .forEach(function (request) {
                                            if (assetCache.indexOf(request.url) == -1) {
                                                assetCache.delete(request);
                                            }
                                        });
                                });
                        });

                    cache
                        .put(request, response.clone())
                        .then(function () {
                            console.log("cached");
                        }, function () {
                            console.log("no cache");
                        });

                    return response;
                });
        });
    }
}

function antinaziCacheResponse(request) {
    return caches
        .match(request)
        .then(function (response) {
            if (response) {
                return response;
            }

            return fetch(request.clone()).then(function (response) {
                caches
                    .open('public')
                    .then(function (cache) {
                        cache
                            .put(request, response)
                            .then(function () {
                                console.log('yey img cache');
                            }, function () {
                                console.log('nay img cache');
                            });
                    });

                return response.clone();
            });
        });
}
