self.addEventListener("fetch", function(event) {
    var request = event.request;
    request.url.indexOf("https://antinazi.org") > -1 && event.respondWith(caches.match(event.request).then(function(response) {
        return response || fetch(request);
    }));
});
