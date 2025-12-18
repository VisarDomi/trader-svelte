import type { UTCTimestamp } from 'lightweight-charts';
import {DateTime} from "luxon";
import * as API from '$lib/constants/api.js';
import * as TIME from '$lib/constants/time.js';
import { getBaseUrl } from "$lib/utils/helpers.js";
import { REAL_TYPE } from "$lib/constants/auth.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { MarketPriceResponse, ChartCandle } from "$lib/types/market.js";
import { DEFAULT_ERROR } from "$lib/constants/error.js";

export async function getHistoricalPrices(
    tokens: SessionTokens,
    epic: string
): Promise<ChartCandle[]> {
    const baseUrl = getBaseUrl(REAL_TYPE);
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
    return data.prices.map(p => ({
        time: DateTime.fromISO(p.snapshotTimeUTC, { zone: TIME.UTC_ZONE }).toSeconds() as UTCTimestamp,
        open: p.openPrice.bid,
        high: p.highPrice.bid,
        low: p.lowPrice.bid,
        close: p.closePrice.bid
    })).sort((a, b) => (a.time as number) - (b.time as number));
}