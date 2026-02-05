import * as TRADING from '$lib/shared/constants/trading.js';
import { TradingDomain } from '$lib/domains/trading/domain/TradingDomain.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { tradeManager as tradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import type { ChartClickEvent } from '$lib/components/chart-engine/ChartEvents.svelte.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class ChartInteractionManager {
    private tradingDomain = new TradingDomain();

    // The logic needs access to the current MarketDetails to plan trades
    // We pass it in or update it via a setter, similar to the state manager
    private marketDetails: MarketDetailsResponse | null = null;
    private userLeverage = 1;

    updateContext(details: MarketDetailsResponse, leverage: number) {
        this.marketDetails = details;
        this.userLeverage = leverage;
    }

    handleChartClick(event: ChartClickEvent) {
        if (!this.marketDetails) return;

        // If block logic is true, ignore click
        if (this.isInteractionBlocked()) return;

        const bid = marketStore.bid;
        const offer = marketStore.offer;

        const intent = this.tradingDomain.determineIntent(event.price, bid, offer);

        if (intent) {
            marketStore.setDataSource(intent.source);
            tradeStore.plan(
                intent.entryPrice,
                intent.targetPrice,
                intent.direction,
                this.marketDetails,
                this.userLeverage
            );
        }
    }

    async confirmTrade() {
        const result = await tradeStore.execute();
        if (result) {
            const source = result.position.direction === TRADING.SELL_DIRECTION
                ? TRADING.CHART_DATA_SOURCE_OFR
                : TRADING.CHART_DATA_SOURCE_BID;
            marketStore.setDataSource(source);
        }
    }

    cancelPlanning() {
        tradeStore.cancel();
        if (!positionStore.activePosition) {
            marketStore.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
        }
    }

    isInteractionBlocked(): boolean {
        if (tradeStore.isExecuting) return true;
        // Block new trade planning if we already have an active position
        if (positionStore.anyActivePosition) return true;
        return false;
    }
}