import { RiskManager } from '$lib/domains/trading/domain/RiskManager.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { getMarketDetails } from '$lib/domains/market/services/MarketApiService.js';
import { getPositions } from '$lib/domains/trading/services/TradeApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class RiskService {
    private manager = new RiskManager();
    private interval: ReturnType<typeof setInterval> | null = null;
    private marketDetailsCache = new Map<string, MarketDetailsResponse>();
    private pendingDealId: string | null = null;

    constructor() {
        bus.on(EVENTS.TRADE_EXECUTED, () => {
            console.log('[RiskService] Trade executed event received. Running immediate risk check.');
            const pos = positionStore.anyActivePosition;
            if (pos) this.pendingDealId = pos.position.dealId;
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
            const dealId = position.position.dealId;

            // Only poll for readiness on freshly opened positions
            if (this.pendingDealId === dealId) {
                console.log(`[RiskService] Correction needed. Waiting for broker to confirm position...`);
                const confirmed = await this.waitForBrokerPosition(dealId);
                this.pendingDealId = null;
                if (!confirmed) return;
            }

            console.log(`[RiskService] Updating SL to ${correction}`);
            await positionStore.updateStopLoss(correction);
        }
    }

    /**
     * Poll the broker until the dealId appears in the positions list.
     * Prevents 404s when the broker hasn't persisted the position yet.
     */
    private async waitForBrokerPosition(dealId: string): Promise<boolean> {
        const client = api.client;
        if (!client) return false;

        // Exponential backoff: 100, 200, 400, 800, 1600, 3200ms (~6.3s total)
        let delay = 100;
        const maxDelay = 3200;

        while (delay <= maxDelay) {
            await new Promise(r => setTimeout(r, delay));
            try {
                const list = await getPositions(client);
                if (list.positions.some(p => p.position.dealId === dealId)) {
                    return true;
                }
            } catch {
                // Network error — keep trying
            }
            console.log(`[RiskService] Position ${dealId} not yet at broker (waited ${delay}ms)`);
            delay *= 2;
        }

        console.warn(`[RiskService] Position ${dealId} not found after backoff. Skipping SL update.`);
        return false;
    }
}

export const riskService = new RiskService();