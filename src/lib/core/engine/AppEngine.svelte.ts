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
    private recovery: RecoveryManager;

    // iOS resume tracking
    private backgroundedAt = 0;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    constructor() {
        // Initialize Delegates
        this.recovery = new RecoveryManager((s) => this.setStatus(s));

        this.monitor = new ConnectionMonitor(
            (online) => this.handleConnectivityChange(online),
            (visible) => this.handleVisibilityChange(visible)
        );

        if (browser) {
            watchdog.setOnFreeze((gap) => {
                // Only trigger recovery when READY — prevents re-entrant calls during RECONNECTING
                if (this.status === 'READY') {
                    void this.recovery.handleFreeze(gap);
                }
            });
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
                this.backgroundedAt = Date.now();
                this.transitionTo('BACKGROUND');
                this.startBackgroundSentinel();
            }
        } else {
            this.stopBackgroundSentinel();
            if (this.status === 'BACKGROUND') {
                this.executeResume();
            }
        }
    }

    /**
     * Shared resume logic — called by visibilitychange, focus, or the background sentinel.
     * Checks status to prevent duplicate execution from multiple signals.
     */
    private executeResume() {
        if (this.status !== 'BACKGROUND') return;

        const elapsed = Date.now() - this.backgroundedAt;
        this.backgroundedAt = 0;
        this.stopBackgroundSentinel();

        if (elapsed > RESUME_RECOVERY_MS) {
            void this.resumeFromSleep(elapsed);
        } else {
            this.transitionTo('READY');
            void positionPoller.refresh();
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
                console.warn(`[AppEngine] Sentinel: visibilitychange missed, forcing resume (frozen ${Math.round(delta / 1000)}s)`);
                this.executeResume();
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
     * Resumes from an iOS sleep / long background.
     * Validates session (refreshing stale tokens) BEFORE restarting the WebSocket.
     */
    private async resumeFromSleep(elapsed: number) {
        this.status = 'RECONNECTING';

        try {
            await authStore.validateSession();
        } catch (e) {
            if (e instanceof AuthError) {
                this.status = 'UNAUTHENTICATED';
                await goto('/login');
                return;
            }
            // Network error — proceed with existing tokens, services will retry
            console.warn('[AppEngine] Session validation failed on resume', e);
        }

        // Restart services with (potentially refreshed) tokens
        this.transitionTo('READY');

        // Refresh data
        try {
            await Promise.all([
                accountStore.refreshActive(),
                positionPoller.refresh()
            ]);
        } catch {
            // Non-critical — services are running and will catch up
        }

        if (elapsed > DEEP_SLEEP_THRESHOLD) {
            notifications.info('Session restored');
        }
    }
}

export const appEngine = new AppEngine();