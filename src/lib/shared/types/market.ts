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

/** Full OHLC candle — close is exclusively owned by tick data. */
export interface ChartCandle {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

/** API-sourced candle frame — no close field, enforcing tick-only ownership of close at the type level. */
export interface CandleFrame {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
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
        timestamp: number;
    }
}

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
    type: string;
    guaranteedStopAllowed: boolean;
    streamingPricesAvailable: boolean;
    currency: string;
    marginFactor: number;
    marginFactorUnit: string;
    openingHours: MarketOpeningHours;
    overnightFee?: MarketOvernightFee;
}

export interface DealingRuleValue {
    unit: string;
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
    marketStatus: string;
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

export interface MarketSummary {
    delayTime: number;
    epic: string;
    symbol: string;
    instrumentName: string;
    instrumentType: string;
    netChange: number;
    percentageChange: number;
    updateTime: string;
    updateTimeUTC: string;
    bid: number;
    offer: number;
    high: number;
    low: number;
    marketStatus: string;
    scalingFactor: number;
    marketModes: string[];
    lotSize: number;
}

export interface MarketListResponse {
    markets?: MarketSummary[];
    marketDetails?: MarketDetailsResponse[];
}
