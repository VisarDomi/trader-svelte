import type { MarketDetailsResponse, ChartCandle } from "$lib/shared/types/market.js";
import type { PositionResponse } from "$lib/shared/types/trading.js";

export class ChartContext {

    marketDetails = $state<MarketDetailsResponse | null>(null);
    currentPrice = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);

    activePosition = $state<PositionResponse | null>(null);
    accountBalance = $state(0);
    activeSymbol = $state("");

    isPlanningTrade = $state(false);
    viewportWidth = $state(0);
    viewportHeight = $state(0);

    get isMarketLoaded() {
        return !!this.marketDetails;
    }

    get hasPosition() {
        return !!this.activePosition;
    }
}
