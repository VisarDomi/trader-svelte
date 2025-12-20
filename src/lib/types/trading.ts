import {BUY_DIRECTION, SELL_DIRECTION} from "$lib/constants/trading.js";

export type Direction = typeof BUY_DIRECTION | typeof SELL_DIRECTION;

export interface PositionBody {
    contractSize: number;
    createdDate: string;
    createdDateUTC: string;
    dealId: string;
    dealReference: string;
    workingOrderId?: string;
    size: number;
    leverage: number;
    upl: number;
    direction: Direction;
    level: number;
    currency: string;
    guaranteedStop: boolean;
    stopLevel?: number;
    profitLevel?: number;
    stopDistance?: number;
    profitDistance?: number;
    initialBalance?: number;
}

export interface PositionMarket {
    instrumentName: string;
    expiry: string;
    marketStatus: string;
    epic: string;
    symbol: string;
    instrumentType: string;
    lotSize: number;
    high: number;
    low: number;
    percentageChange: number;
    netChange: number;
    bid: number;
    offer: number;
    updateTime: string;
    updateTimeUTC: string;
    delayTime: number;
    streamingPricesAvailable: boolean;
    scalingFactor: number;
    marketModes: string[];
}

export interface PositionResponse {
    position: PositionBody;
    market: PositionMarket;
}

export interface PositionListResponse {
    positions: PositionResponse[];
}

export interface CreatePositionResponse {
    dealReference: string;
}

export interface TradeRequest {
    epic: string;
    direction: Direction;
    size: number;
    stopLevel?: number;
    profitLevel?: number;
    guaranteedStop?: boolean;
    trailingStop?: boolean;
    stopDistance?: number;
    profitDistance?: number;
}