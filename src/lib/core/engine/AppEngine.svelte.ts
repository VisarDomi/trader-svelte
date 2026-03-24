import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Delegates
import { SystemController } from '$lib/core/engine/SystemController.js';
import { ConnectionMonitor } from '$lib/core/engine/ConnectionMonitor.svelte.js';

// Services
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';

// Domain Imports for Boot
import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { AuthError } from '$lib/core/api/ApiClient.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

const DEEP_SLEEP_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const RESUME_RECOVERY_MS = 5_000; // 5 seconds — validate session for any non-trivial background

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

    // Resume tracking
    private backgroundedAt = 0;
    private resumeInProgress = false;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    constructor() {
        this.monitor = new ConnectionMonitor(
            (online) => this.handleConnectivityChange(online),
            (visible) => this.handleVisibilityChange(visible)
        );
    }

    // Expose connectivity state from monitor
    get isOnline() { return this.monitor.isOnline; }

    /**
     * Called from +layout.svelte onMount.
     */
    async boot() {
        log.info('[AppEngine] Booting...');

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
                log.warn('[AppEngine] Boot Auth failed:', e.message);
                serverLog({ tag: LogEvent.AuthFailure, phase: 'boot', error: e.message });
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
            log.info('[AppEngine] Ready');
        } catch (e) {
            // Handle fatal boot errors
            if (e instanceof AuthError || String(e).includes('401')) {
                serverLog({ tag: LogEvent.AuthFailure, phase: 'boot-load', error: e instanceof Error ? e.message : String(e) });
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }
            log.error('[AppEngine] Boot load failed', e);
            notifications.error('Failed to load data. Retrying...');
            this.transitionTo('READY');
        }
    }

    // --- State Management ---

    /**
     * Exit/Enter pattern — hibernate only on EXIT from READY, wakeUp only on ENTER to READY.
     */
    private transitionTo(newStatus: AppStatus) {
        const oldStatus = this.status;

        // EXIT: tear down services when leaving READY
        if (oldStatus === 'READY' && newStatus !== 'READY') {
            SystemController.hibernate();
        }

        this.status = newStatus;

        // ENTER: start services when arriving at READY
        if (newStatus === 'READY' && oldStatus !== 'READY') {
            SystemController.wakeUp();
        }
    }

    // --- Event Handlers (Delegated from Monitor) ---

    private handleConnectivityChange(isOnline: boolean) {
        if (isOnline) {
            notifications.info('Internet restored');
            this.handleResume();
        } else {
            this.transitionTo('OFFLINE');
            notifications.error('No Internet Connection');
        }
    }

    private handleVisibilityChange(isVisible: boolean) {
        if (!isVisible) {
            if (this.status === 'READY') {
                this.backgroundedAt = Date.now();
                this.transitionTo('BACKGROUND');
                this.startBackgroundSentinel();
            }
        } else {
            this.stopBackgroundSentinel();
            this.handleResume();
        }
    }

    /**
     * Single resume entry point — all signals (visibility, focus, pageshow, sentinel, online)
     * funnel here. Re-entrancy guard prevents concurrent recovery from rapid-fire signals.
     */
    private handleResume() {
        if (this.status !== 'BACKGROUND' && this.status !== 'OFFLINE') return;
        if (this.resumeInProgress) return;
        this.resumeInProgress = true;

        const elapsed = Date.now() - this.backgroundedAt;
        this.backgroundedAt = 0;
        this.stopBackgroundSentinel();

        if (elapsed > RESUME_RECOVERY_MS) {
            void this.resumeFromSleep(elapsed);
        } else {
            this.transitionTo('READY');
            this.resumeInProgress = false;
        }
    }

    /**
     * iOS PWA: visibilitychange often doesn't fire on screen unlock.
     * This timer gets frozen by iOS when JS is suspended. When iOS resumes JS,
     * the interval fires with a large time delta — our most reliable wake signal.
     */
    private startBackgroundSentinel() {
        this.stopBackgroundSentinel();
        this.bgSentinelTick = Date.now();

        this.bgSentinelId = setInterval(() => {
            const now = Date.now();
            const delta = now - this.bgSentinelTick;
            this.bgSentinelTick = now;

            // Large delta = JS was frozen by iOS and has now resumed.
            // Only act if page is actually visible (screen unlocked) and we're still stuck in BACKGROUND.
            if (delta > 3000 && this.status === 'BACKGROUND' && document.visibilityState === 'visible') {
                log.warn(`[AppEngine] Sentinel: visibilitychange missed, forcing resume (frozen ${Math.round(delta / 1000)}s)`);
                this.handleResume();
            }
        }, 1000);
    }

    private stopBackgroundSentinel() {
        if (this.bgSentinelId) {
            clearInterval(this.bgSentinelId);
            this.bgSentinelId = null;
        }
    }

    /**
     * Resumes from a long background / deep sleep.
     * Validates session (refreshing stale tokens) BEFORE restarting services.
     * No eager data fetches — MarketDataPump's first-tick handles position + history sync.
     */
    private async resumeFromSleep(elapsed: number) {
        serverLog({ tag: LogEvent.AppRestore, elapsedMs: elapsed, fromStatus: this.status });
        this.status = 'RECONNECTING';

        try {
            try {
                await authStore.validateSession();
            } catch (e) {
                if (e instanceof AuthError) {
                    serverLog({ tag: LogEvent.AuthFailure, phase: 'resume', error: e.message });
                    this.status = 'UNAUTHENTICATED';
                    await goto('/login');
                    return;
                }
                // Network error — proceed with existing tokens, services will retry
                log.warn('[AppEngine] Session validation failed on resume', e);
            }

            // Restart services with (potentially refreshed) tokens
            this.transitionTo('READY');

            // Refresh account balance — may have changed while backgrounded
            void accountStore.refreshActive();

            notifications.info('Session restored');
        } finally {
            this.resumeInProgress = false;
        }
    }
}

export const appEngine = new AppEngine();
