import * as API from '$lib/constants/api.js';
import { getBaseUrl } from "$lib/utils/helpers";
import { REAL_TYPE } from "$lib/constants/auth";
import type { SessionTokens } from "$lib/types/auth";
import type { MarketPriceResponse, ChartCandle } from "$lib/types/market";
import { DEFAULT_ERROR } from "$lib/constants/error";
import type { UTCTimestamp } from 'lightweight-charts';

export async function getHistoricalPrices(
    tokens: SessionTokens,
    epic: string
): Promise<ChartCandle[]> {
    const baseUrl = getBaseUrl(REAL_TYPE);

    const params = new URLSearchParams({
        [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
        [API.MAX_KEY]: API.MAX_ROWS
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

    return data.prices.map(p => ({
        time: (new Date(p.snapshotTimeUTC).getTime() / 1000) as UTCTimestamp,
        open: p.openPrice.bid,
        high: p.highPrice.bid,
        low: p.lowPrice.bid,
        close: p.closePrice.bid
    })).sort((a, b) => (a.time as number) - (b.time as number));
}