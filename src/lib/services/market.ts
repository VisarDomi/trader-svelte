import type { UTCTimestamp } from 'lightweight-charts';
import {DateTime} from "luxon";
import * as API from '$lib/constants/api.js';
import * as TIME from '$lib/constants/time.js';
import { getBaseUrl } from "$lib/utils/helpers.js";
import { REAL_TYPE } from "$lib/constants/auth.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { MarketPriceResponse, ChartCandle, MarketDetailsResponse } from "$lib/types/market.js";
import { DEFAULT_ERROR } from "$lib/constants/error.js";
import type { URL_TYPE } from "$lib/types/url.js";
import * as TRADING from "$lib/constants/trading.js";

export async function getHistoricalPrices(
    tokens: SessionTokens,
    epic: string,
    type: typeof TRADING.CHART_DATA_SOURCE_BID | typeof TRADING.CHART_DATA_SOURCE_OFR = TRADING.CHART_DATA_SOURCE_BID
): Promise<ChartCandle[]> {
    const baseUrl = getBaseUrl(REAL_TYPE); // Always fetch history from REAL for better data quality? Or match context. User code used REAL_TYPE previously.
    const endDateTime = DateTime.utc();
    const fromUTCDateTime = endDateTime.minus({minutes: TIME.TOTAL_MINUTES_IN_THE_PAST});
    const fromUTC = fromUTCDateTime.startOf(TIME.SECOND_KEY).toISO({suppressMilliseconds: true}).slice(0, -1);
    const toUTC = endDateTime.startOf(TIME.SECOND_KEY).toISO({suppressMilliseconds: true}).slice(0, -1);
    const params = new URLSearchParams({
        [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
        [API.MAX_KEY]: API.MAX_ROWS,
        [API.FROM_KEY]: fromUTC,
        [API.TO_KEY]: toUTC,
    });
    const url = `${baseUrl}${API.PRICES_ENDPOINT}/${epic}?${params.toString()}`;
    const response = await fetch(url, {
        method: API.GET_METHOD,
        headers: {
            [API.CST_KEY]: tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: tokens[API.X_SECURITY_TOKEN_KEY]
        }
    });
    if (!response.ok) {
        throw new Error(DEFAULT_ERROR);
    }
    const data: MarketPriceResponse = await response.json();

    // Map based on requested type (Bid or Ask)
    return data.prices.map(p => {
        const priceSet = type === TRADING.CHART_DATA_SOURCE_OFR ? {
            open: p.openPrice.ask,
            high: p.highPrice.ask,
            low: p.lowPrice.ask,
            close: p.closePrice.ask
        } : {
            open: p.openPrice.bid,
            high: p.highPrice.bid,
            low: p.lowPrice.bid,
            close: p.closePrice.bid
        };

        return {
            time: DateTime.fromISO(p.snapshotTimeUTC, { zone: TIME.UTC_ZONE }).toSeconds() as UTCTimestamp,
            open: priceSet.open,
            high: priceSet.high,
            low: priceSet.low,
            close: priceSet.close
        };
    }).sort((a, b) => (a.time as number) - (b.time as number));
}

export async function getMarketInfo(
    type: URL_TYPE,
    tokens: SessionTokens,
    epic: string
): Promise<string> {
    try {
        const details = await getMarketDetails(type, tokens, epic);
        return details.instrument.name;
    } catch {
        return epic;
    }
}

export async function getMarketDetails(
    type: URL_TYPE,
    tokens: SessionTokens,
    epic: string
): Promise<MarketDetailsResponse> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.MARKETS_ENDPOINT}/${epic}`;

    const response = await fetch(url, {
        method: API.GET_METHOD,
        headers: {
            [API.CST_KEY]: tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: tokens[API.X_SECURITY_TOKEN_KEY]
        }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.errorCode || DEFAULT_ERROR);
    }

    return await response.json() as MarketDetailsResponse;
}