import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Core Services
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';

// Domain Stores & Services
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';

import * as AUTH from '$lib/shared/constants/auth.js';

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
            // REMOVED: positionStore.startAutoRefresh() - Cannot be called here
        }
    }

    /**
     * Called from +layout.svelte onMount.
     * This is safe for creating effects.
     */
    async boot() {
        console.log('[AppEngine] Booting...');

        // ACTIVATE REACTIVE SERVICES HERE (Inside Component Context)
        positionStore.startAutoRefresh();

        // RiskService uses setInterval, not $effect, so it's safe anywhere,
        // but let's keep it close to boot for logic consistency.
        riskService.start();

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
            console.warn('[AppEngine] Auth failed', e);
            this.status = 'UNAUTHENTICATED';
            await goto('/login');
            return;
        }

        this.status = 'LOADING';
        try {
            await accountStore.loadAll();

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

            watchdog.start();
            this.status = 'READY';
            console.log('[AppEngine] Ready');

        } catch (e) {
            console.error('[AppEngine] Data load failed', e);
            notifications.error('Failed to load account data');
            this.status = 'READY';
        }
    }

    async handleFreeze() {
        if (this.status === 'RECONNECTING' || this.status === 'OFFLINE') return;

        console.warn('[AppEngine] Freeze detected. Reconnecting...');
        this.status = 'RECONNECTING';
        notifications.info('Connection disrupted. Reconnecting...');

        try {
            await authStore.validateSession();

            await Promise.all([
                accountStore.refreshActive(),
                positionStore.refresh()
            ]);

            this.status = 'READY';
            notifications.success('Reconnected');
        } catch (e) {
            console.error('[AppEngine] Reconnect failed', e);
            notifications.error('Reconnection failed. Please reload.');
        }
    }

    handleVisibilityChange(isVisible: boolean) {
        if (!isVisible) {
            this.status = 'BACKGROUND';
        } else {
            if (this.status === 'BACKGROUND') {
                this.status = 'READY';
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
    }

    private async handleOnline() {
        this.isOnline = true;
        notifications.info('Internet restored');
        await this.handleFreeze();
        watchdog.start();
    }
}

export const appEngine = new AppEngine();