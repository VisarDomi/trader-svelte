import { goto } from '$app/navigation';
import { getMarketDetails } from '$lib/services/market.js';
import { api } from '$lib/services/api.svelte.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';

import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { SessionManager } from '$lib/services/session.js';

export class ChartOverlay {
    isOpen = $state(false);
    marketName = $state('');

    constructor(
        private readonly accountStore: AccountStore,
        private readonly positionStore: PositionStore,
        private readonly session: SessionManager
    ) {}

    // --- Derived View State ---

    // 1. Theme / Border Color based on Mode
    get modeColor() {
        return this.session.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350';
    }

    // 2. Account Information
    get hasActiveAccount() {
        return !!this.accountStore.activeAccount;
    }

    get accountName() {
        return this.accountStore.activeAccount?.accountName ?? '—';
    }

    get accountBalanceDisplay() {
        const a = this.accountStore.activeAccount;
        if (!a) return '—';
        return `${a.symbol}${a.balance.deposit.toFixed(2)}`;
    }

    get currentMode() {
        return this.session.mode;
    }

    // 3. Position Information
    // WE USE anyActivePosition HERE TO SHOW GLOBAL STATUS
    get hasPosition() {
        return !!this.positionStore.anyActivePosition;
    }

    get positionDirection() {
        return this.positionStore.anyActivePosition?.position.direction ?? '';
    }

    get positionSize() {
        return this.positionStore.anyActivePosition?.position.size ?? 0;
    }

    get positionColor() {
        const dir = this.positionStore.anyActivePosition?.position.direction;
        return dir === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350';
    }

    get isClosing() {
        return this.positionStore.isClosing;
    }

    get closeButtonText() {
        return this.positionStore.isClosing ? '...' : 'Close Position';
    }

    get closeButtonColor() {
        return this.positionStore.isClosing ? '#444' : '#ef5350';
    }

    // --- Actions ---

    async init(epic: string) {
        // Fetch the friendly name for the UI
        const client = api.client;
        if (client) {
            try {
                const md = await getMarketDetails(client, epic);
                this.marketName = md.instrument.name;
            } catch {
                this.marketName = epic;
            }
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }

    async closePosition() {
        if (this.isClosing) return;
        await this.positionStore.close();
    }

    // Navigation Actions
    navToInstrument() {
        void goto('/instrument');
    }

    navToAccounts() {
        const activeId = this.accountStore.activeAccount?.accountId;
        const url = activeId ? `/accounts#${activeId}` : '/accounts';
        void goto(url);
    }

    navToPosition() {
        void goto('/position');
    }

    destroy() {
        // No explicit cleanup needed for runes usually, unless listeners attached
    }
}