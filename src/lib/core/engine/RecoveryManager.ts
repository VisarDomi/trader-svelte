import { goto } from '$app/navigation';
import { SystemController } from '$lib/core/engine/SystemController.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';

import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { AuthError } from '$lib/core/api/ApiClient.js';
import { log } from '$lib/shared/utils/log.js';

const DEEP_SLEEP_THRESHOLD = 10 * 60 * 1000; // 10 Minutes

export class RecoveryManager {

    constructor(
        private setStatus: (status: any) => void
    ) {}

    /**
     * The main entry point for recovery.
     * Decides whether to do a Hard Restart (Deep Sleep) or Soft Reconnect (Hiccup).
     */
    async handleFreeze(gap: number) {
        log.warn(`[RecoveryManager] Freeze detected (${Math.round(gap/1000)}s). Recovery initiated...`);
        this.setStatus('RECONNECTING');

        if (gap > DEEP_SLEEP_THRESHOLD) {
            await this.executeDeepSleepRestart();
        } else {
            await this.executeSoftReconnect();
        }
    }

    private async executeDeepSleepRestart() {
        log.info('[RecoveryManager] Deep Sleep detected. Performing Hard Restart.');
        notifications.info('Session restored');

        try {
            // 1. Validate session first (may refresh stale tokens)
            await authStore.validateSession();

            // 2. Restart services with fresh tokens
            SystemController.restart();

            // 3. Re-verify everything from scratch
            await accountStore.loadAll();
            this.setStatus('READY');
        } catch (e) {
            await this.handleRecoveryFailure(e, () => this.executeDeepSleepRestart());
        }
    }

    private async executeSoftReconnect() {
        notifications.info('Connection disrupted. Reconnecting...');
        try {
            // 1. Validate session (refresh stale tokens)
            await authStore.validateSession();

            // 2. Restart services (stream, polling, watchdog) with fresh tokens
            SystemController.restart();

            // 3. Refresh Data (Parallel)
            await Promise.all([
                accountStore.refreshActive(),
                positionPoller.refresh()
            ]);

            this.setStatus('READY');
            notifications.success('Reconnected');
        } catch (e) {
            await this.handleRecoveryFailure(e, () => this.executeSoftReconnect());
        }
    }

    private async handleRecoveryFailure(e: unknown, retryAction: () => Promise<void>) {
        if (e instanceof AuthError) {
            // Fatal Error: User session is dead.
            log.error('[RecoveryManager] Reconnect failed: Auth Error');
            this.setStatus('UNAUTHENTICATED');
            await goto('/login');
            return;
        }

        // Transient Error: Network / Timeout / API Glitch
        log.warn('[RecoveryManager] Reconnect failed. Retrying in 3s...', e);

        // Simple Retry Strategy
        setTimeout(() => {
            void retryAction();
        }, 3000);
    }
}