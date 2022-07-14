const addResourcesToCache = async(resources) => {
    const cache = await caches.open("an-v8");
    await cache.addAll(resources);
};

self.addEventListener("install", (event) => {
    event.waitUntil(
        addResourcesToCache([
            "/",
            "/index.html",
            "/css/style_1.css",
            "/js/main.js",
            "/touch-icon-ipad-retina.png",
            "/touch-icon-iphone-retina.png",
            "/apple-touch-icon.png",
            "/favicon.png",
            "/favicon.svg",
            "/maskable_icon.png",
            "/icon_x72.png",
            "/icon_x96.png",
            "/icon_x128.png",
            "/icon_x192.png",
            "/icon_x384.png",
            "/icon_x512.png",
            "/AntiNaziTwitter.png",
            "/manifest.webmanifest",
        ])
    );
});
