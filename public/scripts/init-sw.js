if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            console.log('[APP] SW registered:', registration.scope);

            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New content available, prompt user to refresh
                        console.log('[APP] New version available, refresh to apply');
                    }
                });
            });
        } catch (error) {
            console.error('[APP] SW registration failed:', error);
        }
    });
}
