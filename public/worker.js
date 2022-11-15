var CACHE_NAME = "an-v3";

var urlsToCache = [
    ".",
    "/",
    "/js",
    "/css",
    "/images",
    "/res",
    "./well-known"
];

// Install a service worker
self.addEventListener("install", (event) => {
    // Perform install steps
    caches
        .open(CACHE_NAME)
        .then(function (cache) {
            Promise.all(urlsToCache.map(function (url) {
                cache.add(url);
            }));
        });
});

// Cache lookup and fetch the request
self.addEventListener("fetch", (event) => {
    event.respondWith(caches.match(event.request).then(function (response) {
        // Cache hit - return response
        if (response) {
            return response;
        }
        return fetch(event.request).then(function (response) {
            if (!response || response.status !== 200 || response.type !== "basic") {
                return response;
            }

            // Clone the response before putting into cache so that response to browser and
            // response to cache happen in two separate streams
            var responseForCache = response.clone();
            caches
                .open(CACHE_NAME)
                .then(function (cache) {
                    cache.put(event.request, responseForCache);
                });
            return response;
        });
    }));
});

// Update service worker
self.addEventListener("activate", (event) => {
    var cacheWhitelist = ["an-v3"];
    event.waitUntil(caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
                return caches.delete(cacheName);
            }
        }));
    }));
});
