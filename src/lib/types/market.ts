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