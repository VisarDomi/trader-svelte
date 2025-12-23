import { goto } from '$app/navigation';
import { api } from '$lib/services/api.svelte.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPreferences } from "$lib/services/account.js";
import { LeverageService } from '$lib/domain/account/LeverageService.js';

// Stores types
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { MarketStore } from '$lib/stores/market.svelte.js';

// Types
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { ChartData } from "$lib/types/trading";
import * as TRADING from '$lib/constants/trading.js';

export interface ChartContext {
    marketDetails: MarketDetailsResponse;
    userLeverage: number;
    precision: number;
    epic: string;
}

export class ChartDataLoader {

    constructor(
        private readonly accountStore: AccountStore,
        private readonly positionStore: PositionStore,
        private readonly marketStore: MarketStore
    ) {}

    async ensureSession(): Promise<boolean> {
        try {
            await authenticateAndStoreSession();
            return true;
        } catch {
            await goto('/login');
            return false;
        }
    }

    async loadContext(epic: string): Promise<ChartContext | null> {
        // 1. Init Stores SEQUENTIALLY to avoid race conditions
        // PositionStore requires AccountStore to be ready for PnL calcs
        await this.accountStore.init();
        await this.positionStore.init(epic);

        const client = api.client;
        if (!client) return null;

        try {
            // 2. Fetch Configuration (Parallel)
            const [md, prefs] = await Promise.all([
                getMarketDetails(client, epic),
                getPreferences(client)
            ]);

            // 3. Resolve Domain Logic
            const userLeverage = LeverageService.getEffectiveLeverage(md, prefs);
            const precision = Math.pow(10, md.snapshot.decimalPlacesFactor);

            return {
                marketDetails: md,
                userLeverage,
                precision,
                epic
            };

        } catch (e) {
            console.error("Chart Context Load Failed", e);
            return null;
        }
    }

    async initStream(epic: string, activeDirection: string | undefined) {
        const source = this.getDataSourceForDirection(activeDirection);
        await this.marketStore.init(epic, source);
    }

    disconnectStream() {
        this.marketStore.disconnect();
    }

    async reconnectStream(epic: string) {
        this.disconnectStream();
        const authorized = await this.ensureSession();
        if (authorized) {
            await this.marketStore.init(epic, this.marketStore.dataSource);
        }
    }

    private getDataSourceForDirection(direction: string | undefined): ChartData {
        if (direction === TRADING.SELL_DIRECTION) {
            return TRADING.CHART_DATA_SOURCE_OFR;
        }
        return TRADING.CHART_DATA_SOURCE_BID;
    }
}