import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Core Services
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';

// Domain Stores (New Paths)
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';

// Constants
import * as TRADING from '$lib/shared/constants/trading.js';
import * as AUTH from '$lib/shared/constants/auth.js';

export type AppStatus =
    | 'BOOTING'      // Initial page load
    | 'AUTH_CHECK'   // Validating session tokens
    | 'LOADING'      // Fetching accounts/settings
    | 'READY'        // App is interactive
    | 'BACKGROUND'   // Tab hidden / Phone locked
    | 'RECONNECTING' // Recovering from freeze/network drop
    | 'OFFLINE';     // No internet

class AppEngine {
    // Reactive State
    status = $state<AppStatus>('BOOTING');
    isOnline = $state(true);

    constructor() {
        if (browser) {
            this.setupListeners();
            // AppEngine owns the Watchdog
            watchdog.setOnFreeze(() => this.handleFreeze());
        }
    }

    /**
     * The Master Boot Sequence.
     * Call this from +layout.svelte onMount.
     */
    async boot() {
        console.log('[AppEngine] Booting...');

        // 1. Initialize Infrastructure
        viewport.init();
        this.status = 'AUTH_CHECK';

        // 2. Network Check
        if (browser && !navigator.onLine) {
            this.handleOffline();
            return;
        }

        // 3. Authentication
        try {
            // Attempt to restore session tokens from storage
            authStore.init();

            // Validate tokens (Ping) - if this fails, it throws
            await authStore.validateSession();
        } catch (e) {
            console.warn('[AppEngine] Auth failed, redirecting to login', e);
            await goto('/login');
            return;
        }

        // 4. Load Global User Data
        this.status = 'LOADING';
        try {
            await accountStore.loadAll(); // Load Real & Demo accounts

            // Ensure the correct account is active based on Session
            // This fixes the "wrong account/margin" bug
            const savedMode = session.mode;
            const savedAccountId = session.getLastAccountId(savedMode);

            if (savedAccountId) {
                const account = (savedMode === AUTH.REAL_TYPE
                        ? accountStore.realAccounts
                        : accountStore.demoAccounts
                ).find(a => a.accountId === savedAccountId);

                if (account) {
                    await accountStore.switchTo(account, savedMode);
                }
            }

            // 5. Start Background Services
            watchdog.start();
            this.status = 'READY';
            console.log('[AppEngine] Ready');

        } catch (e) {
            console.error('[AppEngine] Data load failed', e);
            notifications.error('Failed to load account data');
        }
    }

    /**
     * Called when the app wakes up from sleep (e.g., phone unlock)
     * or when the Watchdog detects a blocked event loop.
     */
    async handleFreeze() {
        if (this.status === 'RECONNECTING' || this.status === 'OFFLINE') return;

        console.warn('[AppEngine] Freeze detected. Reconnecting...');
        this.status = 'RECONNECTING';
        notifications.info('Connection disrupted. Reconnecting...');

        try {
            // 1. Force disconnect stream to clear stale state
            marketStore.disconnect();

            // 2. Validate Session (Renew tokens if needed)
            await authStore.validateSession();

            // 3. Refresh vital data
            await Promise.all([
                accountStore.refreshActive(),
                positionStore.refresh()
            ]);

            // 4. Reconnect Market Stream (if we know what we are watching)
            if (marketStore.epic) {
                await marketStore.init(marketStore.epic, marketStore.dataSource);
            }

            this.status = 'READY';
            notifications.success('Reconnected');
        } catch (e) {
            console.error('[AppEngine] Reconnect failed', e);
            notifications.error('Reconnection failed. Please reload.');
        }
    }

    /**
     * Logic for when the user minimizes the tab or locks screen.
     */
    handleVisibilityChange(isVisible: boolean) {
        if (!isVisible) {
            this.status = 'BACKGROUND';
            // Optional: Pause heavy rendering here if we had access to Chart
        } else {
            // Coming back to foreground
            if (this.status === 'BACKGROUND') {
                // Check if we drifted too far? 
                // Usually Watchdog handles this, but we can do a quick ping here.
                this.status = 'READY';
                // Trigger a soft refresh just in case
                void positionStore.refresh();
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
        this.status = 'OFFLINE';
        notifications.error('No Internet Connection');
        watchdog.stop();
        marketStore.disconnect();
    }

    private async handleOnline() {
        this.isOnline = true;
        notifications.info('Internet restored');
        await this.handleFreeze(); // Trigger reconnection logic
        watchdog.start();
    }
}

export const appEngine = new AppEngine();