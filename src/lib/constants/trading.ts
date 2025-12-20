export const ACCOUNT_USD_PRICE_PRECISION = 100;

export const STOP_LOSS_RATIO = 0.5;

export const BTCUSD_LEVERAGE = 20;
export const BTCUSD_LEVERAGE_DEMO = 20;
export const NDX_LEVERAGE = 200;
export const NDX_LEVERAGE_DEMO = 200;

export const NDX_SIZE_PRECISION = 100;
export const BTCUSD_SIZE_PRECISION = 10000;

export const NDX_PRICE_PRECISION = 10;
export const BTCUSD_PRICE_PRECISION = 100;

export const NDX_EPIC = "US100";
export const BTCUSD_EPIC = "BTCUSD";

export const BUY_DIRECTION = "BUY";
export const SELL_DIRECTION = "SELL";

export const CHART_DATA_SOURCE_OFR = "ofr";
export const CHART_DATA_SOURCE_BID = "bid";

export interface InstrumentDetail {
    name: string;
    pricePrecision: number;
    sizePrecision: number;
}

export const INSTRUMENT_DETAILS: Record<string, InstrumentDetail> = {
    [NDX_EPIC]: {
        name: "US Tech 100",
        pricePrecision: NDX_PRICE_PRECISION,
        sizePrecision: NDX_SIZE_PRECISION
    },
    [BTCUSD_EPIC]: {
        name: "Bitcoin / USD",
        pricePrecision: BTCUSD_PRICE_PRECISION,
        sizePrecision: BTCUSD_SIZE_PRECISION
    }
};