import { goto } from '$app/navigation';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { authenticateAndStoreSession } from "$lib/domains/auth/services/AuthService.js";
import { getMarketDetails } from "$lib/domains/market/services/MarketApiService.js";
import { getPreferences } from "$lib/domains/trading/services/AccountApiService.js";
import { LeverageService } from '$lib/domains/trading/domain/LeverageService.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';

// Stores types
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { MarketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';

// Types
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { AccountPreferences } from '$lib/shared/types/account.js';
import type { ChartData } from "$lib/shared/types/trading";
import * as TRADING from '$lib/shared/constants/trading.js';

export interface ChartContext {
    marketDetails: MarketDetailsResponse;
    userLeverage: number;
    precision: number;
    epic: string;
}

interface ChartConfiguration {
    marketDetails: MarketDetailsResponse;
    preferences: AccountPreferences;
}

export class ChartLoader {

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
        await this.initializeStores(epic);

        const client = api.client;
        if (!client) return null;

        try {
            const config = await this.fetchConfiguration(client, epic);

            // Determine initial data source based on position direction
            const activePos = this.positionStore.activePosition;
            const direction = activePos?.position.direction;
            const source = this.getDataSourceForDirection(direction);

            // Initialize MarketStore state.
            await this.marketStore.load(epic, source);

            return this.deriveContext(epic, config);
        } catch (e) {
            console.error("Chart Context Load Failed", e);
            return null;
        }
    }

    private async initializeStores(epic: string) {
        await this.accountStore.init();

        // Update Poller Context and trigger refresh manually to sync store
        positionPoller.setEpic(epic);
        await positionPoller.refresh();
    }

    private async fetchConfiguration(client: ApiClient, epic: string): Promise<ChartConfiguration> {
        const [marketDetails, preferences] = await Promise.all([
            getMarketDetails(client, epic),
            getPreferences(client)
        ]);
        return { marketDetails, preferences };
    }

    private deriveContext(epic: string, config: ChartConfiguration): ChartContext {
        const { marketDetails, preferences } = config;

        const userLeverage = LeverageService.getEffectiveLeverage(marketDetails, preferences);
        const precision = Math.pow(10, marketDetails.snapshot.decimalPlacesFactor);

        return {
            marketDetails,
            userLeverage,
            precision,
            epic
        };
    }

    private getDataSourceForDirection(direction: string | undefined): ChartData {
        if (direction === TRADING.SELL_DIRECTION) {
            return TRADING.CHART_DATA_SOURCE_OFR;
        }
        return TRADING.CHART_DATA_SOURCE_BID;
    }
}