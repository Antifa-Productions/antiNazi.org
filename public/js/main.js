navigator.serviceWorker.register("/sw.js"),navigator.serviceWorker.ready.then((e=>e.sync.background.register("backgroundSync"))).then((function(){console.log("Service Worker Registered")}));
