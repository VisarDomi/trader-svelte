import { goto } from '$app/navigation';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { authenticateAndStoreSession } from "$lib/domains/auth/services/AuthService.js";
import { getMarketDetails } from "$lib/domains/market/services/MarketApiService.js";
import { getPreferences } from "$lib/domains/trading/services/AccountApiService.js";
import { LeverageService } from '$lib/domains/trading/domain/LeverageService.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';

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