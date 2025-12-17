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
    time: number; // Unix timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
}