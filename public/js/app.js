self.addEventListener("fetch", function fetcher(event) {
    var request =
        event.request;
    if (request.url.indexOf("antinazi.org") > -1) {
        event.respondWith(caches.match(event.request).then(function(response) {
            return response || fetch(request);
        }));
    }
});
