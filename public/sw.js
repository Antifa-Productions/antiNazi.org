self.addEventListener("install", function (n) {
  n.waitUntil(caches.open("an-4").then(function (n) {
    return n.addAll([
    "/",
    "/index.html",
    "/js/main.js",
    "/touch-icon-ipad-retina.png",
    "/touch-icon-iphone-retina.png",
    "/apple-touch-icon.png",
    "/favicon.png",
    "/favicon.svg",
    "/favicon.ico",
    "/maskable_icon.png",
    "/icon_x72.png",
    "/icon_x96.png",
    "/icon_x128.png",
    "/icon_x192.png",
    "/icon_x384.png",
    "/icon_x512.png",
    "/AntiNaziTwitter.png",
    "/manifest.webmanifest"])
  }))
});
