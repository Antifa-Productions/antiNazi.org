// Register the service worker for offline support and caching
const registerServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
        try {
            const registration = await navigator.serviceWorker.register("./sw.min.js", { scope: "./" });

            if (registration.installing) {
                console.log("Service worker installing");
            } else if (registration.waiting) {
                console.log("Service worker installed (waiting to activate)");
            } else if (registration.active) {
                console.log("Service worker active");
            }

            // Listen for updates to the service worker
            registration.onupdatefound = () => {
                const newWorker = registration.installing;
                newWorker.onstatechange = () => {
                    if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                        // Notify user that an update is available, or trigger a refresh
                        alert("A new version is available. Please refresh!");
                    }
                };
            };

        } catch (error) {
            console.error(`Service worker registration failed: ${error}`);
        }
    } else {
        console.warn("Service workers are not supported in this browser.");
    }
};

registerServiceWorker();
