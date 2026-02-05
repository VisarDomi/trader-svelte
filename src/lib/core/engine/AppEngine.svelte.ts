import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Engine Delegate
import { SystemController } from '$lib/core/engine/SystemController.js';

// Core Services
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';

// Domain Stores
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
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
            console.warn('[AppEngine] Auth failed', e);
            this.status = 'UNAUTHENTICATED';
            await goto('/login');
            return;
        }

        this.status = 'LOADING';
        try {
            await accountStore.loadAll();
            await this.restoreLastAccount();

            this.transitionTo('READY');
            console.log('[AppEngine] Ready');

        } catch (e) {
            console.error('[AppEngine] Data load failed', e);
            notifications.error('Failed to load account data');
            this.transitionTo('READY'); // Proceed anyway, allows manual retry
        }
    }

    private async restoreLastAccount() {
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
            await authStore.validateSession();

            await Promise.all([
                accountStore.refreshActive(),
                positionStore.refresh()
            ]);

            this.transitionTo('READY');
            notifications.success('Reconnected');
        } catch (e) {
            console.error('[AppEngine] Reconnect failed', e);
            notifications.error('Reconnection failed. Retrying...');
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
                // Determine if we need a full reconnect or just a resume
                this.transitionTo('READY');

                // Immediately refresh vital data visually
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