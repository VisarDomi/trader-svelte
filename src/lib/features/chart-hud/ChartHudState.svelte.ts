import { goto } from '$app/navigation';
import { getMarketDetails } from '$lib/domains/market/services/MarketApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import * as TRADING from '$lib/shared/constants/trading.js';

import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { SessionManager } from '$lib/core/services/SessionManager.js';
import type { ChartLogic } from '$lib/features/chart-orchestration/ChartLogic.svelte.js';

export class ChartOverlay {
    isOpen = $state(false);
    marketName = $state('');

    constructor(
        private readonly accountStore: AccountStore,
        private readonly positionStore: PositionStore,
        private readonly session: SessionManager,
        private readonly chartLogic: ChartLogic
    ) {}

    // --- Derived View State ---

    get modeColor() {
        return this.session.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350';
    }

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

    get isClosingPosition() {
        return this.positionStore.isClosing;
    }

    // --- Actions ---

    async init(epic: string) {
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

    resetChart() {
        // Simply delegate to Logic -> StateManager -> Camera
        this.chartLogic.resetChartZoom();
    }

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

    closePosition() {
        void this.positionStore.close();
    }

    destroy() {
        // No explicit cleanup needed
    }
}