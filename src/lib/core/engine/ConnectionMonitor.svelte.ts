import { browser } from '$app/environment';

export class ConnectionMonitor {
    isOnline = $state(true);
    isVisible = $state(true);

    constructor(
        private onConnectivityChange?: (online: boolean) => void,
        private onVisibilityChange?: (visible: boolean) => void
    ) {
        if (browser) {
            this.isOnline = navigator.onLine;
            this.isVisible = document.visibilityState === 'visible';
            this.setupListeners();
        }
    }

    private setupListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.onConnectivityChange?.(true);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.onConnectivityChange?.(false);
        });

        document.addEventListener('visibilitychange', () => {
            const visible = document.visibilityState === 'visible';
            this.isVisible = visible;
            this.onVisibilityChange?.(visible);
        });
    }

    destroy() {
        if (!browser) return;
        // Cleanup if necessary (though usually this singleton lives forever)
    }
}