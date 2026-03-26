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
import { log } from '$lib/shared/utils/log.js';

export class RiskService {
    private manager = new RiskManager();
    private interval: ReturnType<typeof setInterval> | null = null;
    private marketDetailsCache = new Map<string, MarketDetailsResponse>();
    private pendingDealId: string | null = null;

    constructor() {
        bus.on(EVENTS.TRADE_EXECUTED, () => {
            log.info('[RiskService] Trade executed event received. Running immediate risk check.');
            const pos = positionStore.anyActivePosition;
            if (pos) this.pendingDealId = pos.position.dealId;
            setTimeout(() => void this.checkRisk(), 100);
        });
    }

    start() {
        this.stop();

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

        if (!position) return;

        let details: MarketDetailsResponse | null = null;

        if (marketStore.epic === position.market.epic && marketStore.isLoaded) {

        }

        if (!this.marketDetailsCache.has(position.market.epic)) {
            const client = api.client;
            if (client) {
                try {
                    const md = await getMarketDetails(client, position.market.epic);
                    this.marketDetailsCache.set(position.market.epic, md);
                } catch (e) {
                    log.warn('[RiskService] Failed to fetch market details', e);
                    return;
                }
            }
        }

        details = this.marketDetailsCache.get(position.market.epic) || null;
        if (!details) return;

        await accountStore.refreshActive();

        const correction = this.manager.calculateCorrection(
            position.position,
            details,
            accountStore.balance
        );

        if (correction !== null) {
            const dealId = position.position.dealId;

            if (this.pendingDealId === dealId) {
                log.info(`[RiskService] Correction needed. Waiting for broker to confirm position...`);
                const confirmed = await this.waitForBrokerPosition(dealId);
                this.pendingDealId = null;
                if (!confirmed) return;
            }

            log.info(`[RiskService] Updating SL to ${correction}`);
            await positionStore.updateStopLoss(correction);
        }
    }

    private async waitForBrokerPosition(dealId: string): Promise<boolean> {
        const client = api.client;
        if (!client) return false;

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

            }
            log.info(`[RiskService] Position ${dealId} not yet at broker (waited ${delay}ms)`);
            delay *= 2;
        }

        log.warn(`[RiskService] Position ${dealId} not found after backoff. Skipping SL update.`);
        return false;
    }
}

export const riskService = new RiskService();
