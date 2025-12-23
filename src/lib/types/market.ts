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

// --- Detailed Market Types ---

export interface MarketOpeningHours {
    zone: string;
    mon?: string[];
    tue?: string[];
    wed?: string[];
    thu?: string[];
    fri?: string[];
    sat?: string[];
    sun?: string[];
}

export interface MarketOvernightFee {
    longRate: number;
    shortRate: number;
    swapChargeTimestamp?: number;
    swapChargeInterval?: number;
}

export interface MarketInstrument {
    epic: string;
    symbol: string;
    name: string;
    lotSize: number;
    type: string; // e.g., "COMMODITIES", "INDICES"
    guaranteedStopAllowed: boolean;
    streamingPricesAvailable: boolean;
    currency: string;
    marginFactor: number;
    marginFactorUnit: string; // "PERCENTAGE"
    openingHours: MarketOpeningHours;
    overnightFee?: MarketOvernightFee;
}

export interface DealingRuleValue {
    unit: string; // "POINTS", "PERCENTAGE"
    value: number;
}

export interface MarketDealingRules {
    minStepDistance: DealingRuleValue;
    minDealSize: DealingRuleValue;
    maxDealSize: DealingRuleValue;
    minSizeIncrement: DealingRuleValue;
    minGuaranteedStopDistance?: DealingRuleValue;
    minStopOrProfitDistance?: DealingRuleValue;
    maxStopOrProfitDistance?: DealingRuleValue;
    marketOrderPreference: string;
    trailingStopsPreference: string;
}

export interface MarketSnapshot {
    marketStatus: string; // "TRADEABLE", "CLOSED"
    netChange: number;
    percentageChange: number;
    updateTime: string;
    delayTime: number;
    bid: number;
    offer: number;
    high: number;
    low: number;
    decimalPlacesFactor: number;
    scalingFactor: number;
    marketModes: string[];
}

export interface MarketDetailsResponse {
    instrument: MarketInstrument;
    dealingRules: MarketDealingRules;
    snapshot: MarketSnapshot;
}

// Legacy simple response (kept for compatibility if needed)
