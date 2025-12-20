import type { UTCTimestamp } from 'lightweight-charts';

export interface PriceComponent {
    bid: number;
    ask: number;
}

export interface PriceSnapshot {
    snapshotTime: string;
    snapshotTimeUTC: string;
    openPrice: PriceComponent;
    closePrice: PriceComponent;
    highPrice: PriceComponent;
    lowPrice: PriceComponent;
    lastTradedVolume: number;
}

export interface MarketPriceResponse {
    prices: PriceSnapshot[];
}

export interface ChartCandle {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface WebSocketPayload {
    destination: string;
    correlationId?: string;
    cst?: string;
    securityToken?: string;
    payload?: any;
}

export interface QuoteMessage {
    destination: string;
    payload: {
        epic: string;
        product: string;
        bid: number;
        bidQty: number;
        ofr: number;
        ofrQty: number;
        timestamp: number; // Milliseconds
    }
}

// --- New Detailed Market Types ---

export interface MarketInstrument {
    epic: string;
    symbol: string;
    name: string;
    type: string;
    currency: string;
    marginFactor: number;
    marginFactorUnit: string; // e.g., "PERCENTAGE"
    lotSize: number;
}

export interface MarketDealingRules {
    minDealSize: { unit: string; value: number };
    maxDealSize: { unit: string; value: number };
    minSizeIncrement: { unit: string; value: number };
    minStopOrProfitDistance?: { unit: string; value: number };
}

export interface MarketSnapshot {
    marketStatus: string;
    bid: number;
    offer: number;
    high: number;
    low: number;
    decimalPlacesFactor: number; // e.g. 2, 3
    scalingFactor: number;
}

export interface MarketDetailsResponse {
    instrument: MarketInstrument;
    dealingRules: MarketDealingRules;
    snapshot: MarketSnapshot;
}

// Legacy simple response used by overlay (can remain or be refactored later)
export interface SingleMarketResponse {
    instrument: {
        epic: string;
        name: string;
        symbol: string;
        expiry: string;
        type: string;
    };
    snapshot: {
        marketStatus: string;
        netChange: number;
        percentageChange: number;
        bid: number;
        offer: number;
    };
}