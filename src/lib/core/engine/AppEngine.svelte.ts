import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Delegates
import { SystemController } from '$lib/core/engine/SystemController.js';
import { ConnectionMonitor } from '$lib/core/engine/ConnectionMonitor.svelte.js';
import { RecoveryManager } from '$lib/core/engine/RecoveryManager.js';

// Services
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';

// Domain Imports for Boot
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { AuthError } from '$lib/core/api/ApiClient.js';

export type AppStatus =
    | 'BOOTING'
    | 'AUTH_CHECK'
    | 'LOADING'
    | 'READY'
    | 'BACKGROUND'
    | 'RECONNECTING'
    | 'OFFLINE'
    | 'UNAUTHENTICATED';

class AppEngine {
    status = $state<AppStatus>('BOOTING');

    // Dependencies
    private monitor: ConnectionMonitor;
    private recovery: RecoveryManager;

    constructor() {
        // Initialize Delegates
        this.recovery = new RecoveryManager((s) => this.setStatus(s));

        this.monitor = new ConnectionMonitor(
            (online) => this.handleConnectivityChange(online),
            (visible) => this.handleVisibilityChange(visible)
        );

        if (browser) {
            watchdog.setOnFreeze((gap) => this.recovery.handleFreeze(gap));
        }
    }

    // Expose connectivity state from monitor
    get isOnline() { return this.monitor.isOnline; }

    /**
     * Called from +layout.svelte onMount.
     */
    async boot() {
        console.log('[AppEngine] Booting...');

        viewport.init();
        this.status = 'AUTH_CHECK';

        if (!this.monitor.isOnline) {
            this.transitionTo('OFFLINE');
            return;
        }

        try {
            authStore.init();
            await authStore.validateSession();
        } catch (e) {
            if (e instanceof AuthError) {
                console.warn('[AppEngine] Boot Auth failed:', e.message);
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }
            // Continue to LOADING even if weird network error, let account load fail gracefully
        }

        this.status = 'LOADING';
        try {
            await accountStore.loadAll();
            this.transitionTo('READY');
            console.log('[AppEngine] Ready');
        } catch (e) {
            // Handle fatal boot errors
            if (e instanceof AuthError || String(e).includes('401')) {
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }
            console.error('[AppEngine] Boot load failed', e);
            notifications.error('Failed to load data. Retrying...');
            this.transitionTo('READY');
        }
    }

    // --- State Management ---

    private setStatus(s: AppStatus) {
        this.status = s;
    }

    private transitionTo(newStatus: AppStatus) {
        if (this.status === 'READY') {
            SystemController.hibernate();
        }

        this.status = newStatus;

        if (newStatus === 'READY') {
            SystemController.wakeUp();
        } else if (newStatus === 'OFFLINE' || newStatus === 'BACKGROUND') {
            SystemController.hibernate();
        }
    }

    // --- Event Handlers (Delegated from Monitor) ---

    private handleConnectivityChange(isOnline: boolean) {
        if (isOnline) {
            notifications.info('Internet restored');
            // Treat as a small hiccup (1s gap) to trigger soft reconnect logic
            void this.recovery.handleFreeze(1000);
        } else {
            this.transitionTo('OFFLINE');
            notifications.error('No Internet Connection');
        }
    }

    private handleVisibilityChange(isVisible: boolean) {
        if (!isVisible) {
            if (this.status === 'READY') {
                this.transitionTo('BACKGROUND');
            }
        } else {
            if (this.status === 'BACKGROUND') {
                this.transitionTo('READY');
                void positionPoller.refresh();
            }
        }
    }
}

export const appEngine = new AppEngine();