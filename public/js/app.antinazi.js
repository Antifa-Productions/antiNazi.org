const registerServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
        try {
            const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
            if (registration.installing) {
                console.log("Service worker installing");
            } else if (registration.waiting) {
                console.log("Service worker installed");
            } else if (registration.active) {
                console.log("Service worker active");
            }
        } catch (error) {
            console.error(`Service Worker registration failed: ${error}`);
        }
    } else {
        console.warn("Service workers are not supported in this browser.");
    }
};

registerServiceWorker();