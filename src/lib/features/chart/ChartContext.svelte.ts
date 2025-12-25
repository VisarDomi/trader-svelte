import type { MarketDetailsResponse, ChartCandle } from "$lib/types/market.js";
import type { PositionResponse } from "$lib/types/trading.js";

/**
 * Shared Rune-based state that is passed to all ChartFeatures during updates.
 * This replaces the "Prop Drilling" or global store imports inside Renderers.
 */
export class ChartContext {
    // Market Data
    marketDetails = $state<MarketDetailsResponse | null>(null);
    currentPrice = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);

    // User Data
    activePosition = $state<PositionResponse | null>(null);
    accountBalance = $state(0);
    activeSymbol = $state("");

    // UI State
    isPlanningTrade = $state(false);
    viewportWidth = $state(0);
    viewportHeight = $state(0);

    // Derived helpers can go here
    get isMarketLoaded() {
        return !!this.marketDetails;
    }

    get hasPosition() {
        return !!this.activePosition;
    }
}