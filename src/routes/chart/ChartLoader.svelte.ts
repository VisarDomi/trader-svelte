import { goto } from '$app/navigation';
import { api } from '$lib/services/api.svelte.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPreferences } from "$lib/services/account.js";
import { LeverageService } from '$lib/domain/account/LeverageService.js';
import type { ApiClient } from '$lib/api/client.js';

// Stores types
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { MarketStore } from '$lib/stores/market.svelte.js';

// Types
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';
import type { ChartData } from "$lib/types/trading";
import * as TRADING from '$lib/constants/trading.js';

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
        await this.initializeStores(epic);

        const client = api.client;
        if (!client) return null;

        try {
            const config = await this.fetchConfiguration(client, epic);
            return this.deriveContext(epic, config);
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

    private async initializeStores(epic: string) {
        await this.accountStore.init();
        await this.positionStore.init(epic);
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