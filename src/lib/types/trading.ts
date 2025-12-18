import {BUY_DIRECTION, SELL_DIRECTION} from "$lib/constants/trading.js";

export type Direction = typeof BUY_DIRECTION | typeof SELL_DIRECTION;

export interface PositionBody {
    dealId: string;
    dealReference: string;
    size: number;
    direction: Direction;
    level: number;
    upl: number;
    guaranteedStop: boolean;
    createdDate: string;
}

export interface PositionResponse {
    position: PositionBody;
    market: {
        epic: string;
        instrumentName: string;
        marketStatus: string;
    };
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
}