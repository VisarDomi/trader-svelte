import type { UTCTimestamp } from 'lightweight-charts';
import { DateTime } from "luxon";
import * as API from '$lib/constants/api.js';
import * as TIME from '$lib/constants/time.js';
import * as TRADING from "$lib/constants/trading.js";
import type { MarketPriceResponse, ChartCandle, MarketDetailsResponse } from "$lib/types/market.js";
import type { ApiClient } from '$lib/api/client.js';

export async function getHistoricalPrices(
    client: ApiClient,
    epic: string,
    type: typeof TRADING.CHART_DATA_SOURCE_BID | typeof TRADING.CHART_DATA_SOURCE_OFR = TRADING.CHART_DATA_SOURCE_BID
): Promise<ChartCandle[]> {
    const endDateTime = DateTime.utc();
    const fromUTCDateTime = endDateTime.minus({ minutes: TIME.TOTAL_MINUTES_IN_THE_PAST });
    const fromUTC = fromUTCDateTime.startOf(TIME.SECOND_KEY).toISO({ suppressMilliseconds: true }).slice(0, -1);
    const toUTC = endDateTime.startOf(TIME.SECOND_KEY).toISO({ suppressMilliseconds: true }).slice(0, -1);

    const params = {
        [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
        [API.MAX_KEY]: API.MAX_ROWS,
        [API.FROM_KEY]: fromUTC,
        [API.TO_KEY]: toUTC,
    };

    const endpoint = `${API.PRICES_ENDPOINT}/${epic}`;
    const data = await client.get<MarketPriceResponse>(endpoint, params);

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

export function getMarketDetails(
    client: ApiClient,
    epic: string
): Promise<MarketDetailsResponse> {
    return client.get<MarketDetailsResponse>(`${API.MARKETS_ENDPOINT}/${epic}`);
}