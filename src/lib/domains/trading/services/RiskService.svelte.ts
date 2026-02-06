import { RiskManager } from '$lib/domains/trading/domain/RiskManager.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { getMarketDetails } from '$lib/domains/market/services/MarketApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js'; // Import Bus
import * as EVENTS from '$lib/shared/constants/events.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class RiskService {
    private manager = new RiskManager();
    private interval: ReturnType<typeof setInterval> | null = null;
    private marketDetailsCache = new Map<string, MarketDetailsResponse>();

    constructor() {
        // Immediate check upon trade execution
        bus.on(EVENTS.TRADE_EXECUTED, () => {
            console.log('[RiskService] Trade executed event received. Running immediate risk check.');
            // Small delay to ensure stores are settled if necessary, though
            // the event usually implies the position store is updated.
            setTimeout(() => void this.checkRisk(), 100);
        });
    }

    /**
     * Starts the global risk monitor.
     * Should be called by AppEngine on boot.
     */
    start() {
        this.stop();
        // Run check every 10 seconds (approx) or aligned with minute start
        // Using strict interval for simplicity
        this.interval = setInterval(() => this.checkRisk(), 10000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    private async checkRisk() {
        const position = positionStore.anyActivePosition;

        // 1. No position? No risk.
        if (!position) return;

        // 2. We need market details to calculate risk (lot size, etc)
        // We try to use the one in MarketStore if it matches, otherwise we fetch/cache
        let details: MarketDetailsResponse | null = null;

        if (marketStore.epic === position.market.epic && marketStore.isLoaded) {
            // If we are looking at the chart, we might want to grab details,
            // but for now we rely on the cache or fetch to be safe/consistent.
        }

        if (!this.marketDetailsCache.has(position.market.epic)) {
            const client = api.client;
            if (client) {
                try {
                    const md = await getMarketDetails(client, position.market.epic);
                    this.marketDetailsCache.set(position.market.epic, md);
                } catch (e) {
                    console.warn('[RiskService] Failed to fetch market details', e);
                    return;
                }
            }
        }

        details = this.marketDetailsCache.get(position.market.epic) || null;
        if (!details) return;

        // 3. Ensure account balance is fresh
        await accountStore.refreshActive();

        // 4. Calculate
        const correction = this.manager.calculateCorrection(
            position.position,
            details,
            accountStore.balance
        );

        if (correction !== null) {
            console.log(`[RiskService] Correction Needed. Updating SL to ${correction}`);
            await positionStore.updateStopLoss(correction);
        }
    }
}

export const riskService = new RiskService();