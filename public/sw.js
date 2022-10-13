const FILES_CACHE = '';
const Time = set.Response;
var CACHE_NAME = (FILES_CACHE) + (Time);

// Add whichever assets you want to precache here:
const PRECACHE_ASSETS = [
    '/assets/',
    '/src/'
]

// Listener for the install event - precaches our assets list on service worker install.
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        cache.addAll(PRECACHE_ASSETS);
    })());
});
