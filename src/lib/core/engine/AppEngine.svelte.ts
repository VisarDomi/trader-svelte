import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Engine Delegate
import { SystemController } from '$lib/core/engine/SystemController.js';

// Core Services
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';

// Domain Services (The Active Workers)
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';

// Domain Stores (Passive State)
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';

// Errors
import { AuthError, NetworkError } from '$lib/core/api/ApiClient.js';

export type AppStatus =
    | 'BOOTING'      // Initial page load
    | 'AUTH_CHECK'   // Validating session tokens
    | 'LOADING'      // Fetching accounts/settings
    | 'READY'        // App is interactive
    | 'BACKGROUND'   // Tab hidden / Phone locked
    | 'RECONNECTING' // Recovering from freeze/network drop
    | 'OFFLINE'      // No internet
    | 'UNAUTHENTICATED'; // User needs to login

class AppEngine {
    status = $state<AppStatus>('BOOTING');
    isOnline = $state(true);

    constructor() {
        if (browser) {
            this.setupListeners();
            watchdog.setOnFreeze(() => this.handleFreeze());
        }
    }

    /**
     * Called from +layout.svelte onMount.
     * Initializes the application.
     */
    async boot() {
        console.log('[AppEngine] Booting...');

        viewport.init();
        this.status = 'AUTH_CHECK';

        if (browser && !navigator.onLine) {
            this.handleOffline();
            return;
        }

        try {
            authStore.init();
            await authStore.validateSession();
        } catch (e) {
            // Strict Error Handling
            if (e instanceof AuthError) {
                console.warn('[AppEngine] Boot Auth failed:', e.message);
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }

            // If Network/Unknown error during boot, we might be offline or flaking
            console.warn('[AppEngine] Boot Network/Unknown error:', e);
            // We continue to LOADING. accountStore.loadAll() will likely fail
            // and we will handle it in the catch block below.
        }

        this.status = 'LOADING';
        try {
            await accountStore.loadAll();
            this.transitionTo('READY');
            console.log('[AppEngine] Ready');

        } catch (e) {
            const errString = String(e);

            // Double check for Auth errors that might have bubbled from account loading
            if (e instanceof AuthError || errString.includes('401')) {
                console.warn('[AppEngine] Session expired during load');
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }

            console.error('[AppEngine] Data load failed', e);
            notifications.error('Failed to load account data. Retrying in background...');
            this.transitionTo('READY'); // Allow UI to render partial state
        }
    }

    /**
     * Centralized State Transitions
     */
    private transitionTo(newStatus: AppStatus) {
        // TEARDOWN Logic
        if (this.status === 'READY') {
            SystemController.hibernate();
        }

        this.status = newStatus;

        // SETUP Logic
        if (newStatus === 'READY') {
            SystemController.wakeUp();
        } else if (newStatus === 'OFFLINE' || newStatus === 'BACKGROUND') {
            SystemController.hibernate();
        }
    }

    async handleFreeze() {
        if (this.status === 'RECONNECTING' || this.status === 'OFFLINE') return;

        console.warn('[AppEngine] Freeze detected. Reconnecting...');
        this.transitionTo('RECONNECTING');
        notifications.info('Connection disrupted. Reconnecting...');

        try {
            // 1. Verify Session
            await authStore.validateSession();

            // 2. Refresh Data
            await Promise.all([
                accountStore.refreshActive(),
                positionPoller.refresh()
            ]);

            this.transitionTo('READY');
            notifications.success('Reconnected');
        } catch (e) {

            if (e instanceof AuthError) {
                // Hard Failure: Session is definitely dead.
                console.error('[AppEngine] Reconnect failed: Auth Error');
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }

            // Soft Failure: Network / Timeout
            console.warn('[AppEngine] Reconnect failed: Network/Api Error. Retrying...', e);

            // Exponential backoff or simple retry could go here.
            // For now, simple retry in 3s.
            // IMPORTANT: We do NOT logout.
            setTimeout(() => this.handleFreeze(), 3000);
        }
    }

    handleVisibilityChange(isVisible: boolean) {
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

    private setupListeners() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange(document.visibilityState === 'visible');
        });
    }

    private handleOffline() {
        this.isOnline = false;
        this.transitionTo('OFFLINE');
        notifications.error('No Internet Connection');
    }

    private async handleOnline() {
        this.isOnline = true;
        notifications.info('Internet restored');
        await this.handleFreeze();
    }
}

export const appEngine = new AppEngine();