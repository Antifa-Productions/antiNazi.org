var CACHE_NAME = "pwa-v1";
//Just a sample name, the cache name should be more relatable to the application
var urlsToCache = ["/", "/login", "/register"];

// Install a service worker
self.addEventListener("install", (event) => {
    // Perform install steps
    caches.open(CACHE_NAME).then(function (cache) {
        Promise.all(
            urlsToCache.map(function (url) {
                cache.add(url);
            })
        );
    });
});

// Cache lookup and fetch the request
self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then(function (response) {
            // Cache hit - return response
            if (response) {
                return response;
            }
            return fetch(event.request).then(function (response) {
                if (!response || response.status !== 200 || response.type !== "basic") {
                    return response;
                }

                //Clone the response before putting into cache so that response to browser and response to cache happens in two difference streams
                var responseForCache = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(event.request, responseForCache);
                });
                return response;
            });
        })
    );
});

// Update a service worker
self.addEventListener("activate", (event) => {
    var cacheWhitelist = ["pwa-v1"];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
