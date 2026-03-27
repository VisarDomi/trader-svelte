import {BUY_DIRECTION, SELL_DIRECTION} from "$lib/shared/constants/trading.js";
import * as TRADING from "$lib/shared/constants/trading";

export type Direction = typeof BUY_DIRECTION | typeof SELL_DIRECTION;
export type ChartData = typeof TRADING.CHART_DATA_SOURCE_BID | typeof TRADING.CHART_DATA_SOURCE_OFR

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

export interface TradeConfirmation {
    date: string;
    status: string;
    dealStatus: string;
    epic: string;
    dealReference: string;
    dealId: string;
    level: number;
    size: number;
    direction: Direction;
    guaranteedStop: boolean;
    trailingStop: boolean;
    profitLevel?: number;
    stopLevel?: number;
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