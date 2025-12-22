import { goto } from '$app/navigation';
import { api } from '$lib/services/api.svelte.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPreferences } from "$lib/services/account.js";
import { session } from '$lib/services/session.js';

// Stores
import { accountStore } from '$lib/stores/account.svelte.js';
import { positionStore } from '$lib/stores/position.svelte.js';
import { marketStore } from '$lib/stores/market.svelte.js';

// Types
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { LeverageCategory } from '$lib/types/account.js';
import type { ChartData } from "$lib/types/trading";
import * as TRADING from '$lib/constants/trading.js';

export interface ChartContext {
    marketDetails: MarketDetailsResponse;
    userLeverage: number;
    precision: number;
    epic: string;
}

export class ChartDataLoader {

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
        // 1. Init Base Stores
        await Promise.all([
            accountStore.init(),
            positionStore.init(epic)
        ]);

        const client = api.client;
        if (!client) return null;

        try {
            // 2. Fetch Config
            const [md, prefs] = await Promise.all([
                getMarketDetails(client, epic),
                getPreferences(client)
            ]);

            // 3. Calculate Derived Config
            let userLeverage = 1;
            const category = md.instrument.type as LeverageCategory;
            if (prefs.leverages[category]) {
                userLeverage = prefs.leverages[category].current;
            } else if (md.instrument.marginFactorUnit === 'PERCENTAGE') {
                userLeverage = 100 / md.instrument.marginFactor;
            }

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
        // Determine source based on position direction
        let source: ChartData = TRADING.CHART_DATA_SOURCE_BID;
        if (activeDirection === TRADING.SELL_DIRECTION) {
            source = TRADING.CHART_DATA_SOURCE_OFR;
        }

        await marketStore.init(epic, source);
    }
}