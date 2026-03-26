import { goto } from '$app/navigation';
import { browser } from '$app/environment';

import { SystemController } from '$lib/core/engine/SystemController.js';
import { ConnectionMonitor } from '$lib/core/engine/ConnectionMonitor.svelte.js';

import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';

import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { AuthError } from '$lib/core/api/ApiClient.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

const DEEP_SLEEP_THRESHOLD = 10 * 60 * 1000;
const RESUME_RECOVERY_MS = 5_000;

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

    private monitor: ConnectionMonitor;

    private backgroundedAt = 0;
    private resumeInProgress = false;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    constructor() {
        this.monitor = new ConnectionMonitor(
            (online) => this.handleConnectivityChange(online),
            (visible, source) => this.handleVisibilityChange(visible, source)
        );
    }

    get isOnline() { return this.monitor.isOnline; }

    async boot() {
        serverLog({
            tag: LogEvent.Boot,
            hasTokens: session.isAuthenticated(),
            hasEpic: !!session.lastEpic,
            lastEpic: session.lastEpic,
        });

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

        }

        this.status = 'LOADING';
        try {
            await accountStore.loadAll();
            this.transitionTo('READY');
            log.flush();
        } catch (e) {

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

    private transitionTo(newStatus: AppStatus) {
        const oldStatus = this.status;
        serverLog({ tag: LogEvent.StateTransition, from: oldStatus, to: newStatus });

        if (oldStatus === 'READY' && newStatus !== 'READY') {
            SystemController.hibernate();
        }

        this.status = newStatus;

        if (newStatus === 'READY' && oldStatus !== 'READY') {
            SystemController.wakeUp();
        }
    }

    private handleConnectivityChange(isOnline: boolean) {
        if (isOnline) {
            notifications.info('Internet restored');
            this.handleResume('online');
        } else {
            this.transitionTo('OFFLINE');
            notifications.error('No Internet Connection');
        }
    }

    private handleVisibilityChange(isVisible: boolean, source: string) {
        if (!isVisible) {
            if (this.status === 'READY') {
                this.backgroundedAt = Date.now();
                this.transitionTo('BACKGROUND');
                this.startBackgroundSentinel();
            }
        } else {
            this.stopBackgroundSentinel();
            this.handleResume(source);
        }
    }

    private handleResume(source: string) {
        if (this.status !== 'BACKGROUND' && this.status !== 'OFFLINE') {
            serverLog({ tag: LogEvent.ResumeAttempt, source, status: this.status, elapsedMs: 0, path: 'skipped', reason: 'wrong-status' });
            return;
        }
        if (this.resumeInProgress) {
            serverLog({ tag: LogEvent.ResumeAttempt, source, status: this.status, elapsedMs: 0, path: 'skipped', reason: 'in-progress' });
            return;
        }
        this.resumeInProgress = true;

        const elapsed = Date.now() - this.backgroundedAt;
        this.backgroundedAt = 0;
        this.stopBackgroundSentinel();

        if (elapsed > RESUME_RECOVERY_MS) {
            serverLog({ tag: LogEvent.ResumeAttempt, source, status: this.status, elapsedMs: elapsed, path: 'full' });
            void this.resumeFromSleep(elapsed);
        } else {
            serverLog({ tag: LogEvent.ResumeAttempt, source, status: this.status, elapsedMs: elapsed, path: 'short' });
            this.transitionTo('READY');
            this.resumeInProgress = false;
        }
    }

    private startBackgroundSentinel() {
        this.stopBackgroundSentinel();
        this.bgSentinelTick = Date.now();

        this.bgSentinelId = setInterval(() => {
            const now = Date.now();
            const delta = now - this.bgSentinelTick;
            this.bgSentinelTick = now;

            if (delta > 3000 && this.status === 'BACKGROUND' && document.visibilityState === 'visible') {
                log.warn(`[AppEngine] Sentinel: visibilitychange missed, forcing resume (frozen ${Math.round(delta / 1000)}s)`);
                this.handleResume('sentinel');
            }
        }, 1000);
    }

    private stopBackgroundSentinel() {
        if (this.bgSentinelId) {
            clearInterval(this.bgSentinelId);
            this.bgSentinelId = null;
        }
    }

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

                log.warn('[AppEngine] Session validation failed on resume', e);
            }

            this.transitionTo('READY');
            log.flush();

            void accountStore.refreshActive();

            serverLog({ tag: LogEvent.ResumeComplete, elapsedMs: elapsed });
            notifications.info('Session restored');
        } catch (e) {
            serverLog({ tag: LogEvent.ResumeError, error: e instanceof Error ? e.message : String(e) });
            this.transitionTo('READY');
        } finally {
            this.resumeInProgress = false;
        }
    }
}

export const appEngine = new AppEngine();
