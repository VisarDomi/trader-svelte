import { goto } from '$app/navigation';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { getMarketDetails } from "$lib/domains/market/services/MarketApiService.js";
import { getPreferences } from "$lib/domains/trading/services/AccountApiService.js";
import { LeverageService } from '$lib/domains/trading/domain/LeverageService.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';

// Stores types
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js'; // Use singleton directly
import { marketCmd } from '$lib/domains/market/stores/MarketCommands.js';

// Types
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { AccountPreferences } from '$lib/shared/types/account.js';
import type { ChartData } from "$lib/shared/types/trading";
import * as TRADING from '$lib/shared/constants/trading.js';
import { log } from '$lib/shared/utils/log.js';

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
        private readonly marketStoreRef: typeof marketStore
    ) {}

    async ensureSession(): Promise<boolean> {
        // Boot (AppEngine) has already validated/refreshed tokens.
        // Just verify we have them — if not, redirect to login.
        if (!api.client) {
            await goto('/login');
            return false;
        }
        return true;
    }

    async loadContext(epic: string): Promise<ChartContext | null> {
        await this.initializeStores(epic);

        const client = api.client;
        if (!client) return null;

        try {
            const config = await this.fetchConfiguration(client, epic);

            // Populate Metadata in MarketStore (Crucial for Liveness Checks)
            this.marketStoreRef.dispatch(marketCmd.setMetadata(
                config.marketDetails.instrument.epic,
                config.marketDetails.snapshot.marketStatus
            ));

            // Determine initial data source based on position direction
            const activePos = this.positionStore.activePosition;
            const direction = activePos?.position.direction;
            const source = this.getDataSourceForDirection(direction);

            // Initialize Market Data via Pump
            // Pump handles fetching history and populating the store
            await marketDataPump.load(epic, source);

            return this.deriveContext(epic, config);
        } catch (e) {
            log.error("Chart Context Load Failed", e);
            return null;
        }
    }

    private async initializeStores(epic: string) {
        await this.accountStore.init();

        // Sync Position Store via Poller
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