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