import type { ApiClient } from '$lib/core/api/ApiClient.js';
import * as API from '$lib/shared/constants/api.js';
import * as TIME from '$lib/shared/constants/time.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { DateTime } from "luxon";
import type { UTCTimestamp } from 'lightweight-charts';
import type {
    MarketPriceResponse,
    PriceSnapshot,
    ChartCandle
} from '$lib/shared/types/market.js';
import type { ChartData } from '$lib/shared/types/trading.js';

export class MarketRepository {
    constructor(private client: ApiClient) {}

    async getHistory(epic: string): Promise<{ bid: ChartCandle[], ask: ChartCandle[] }> {
        const rawHistory = await this.fetchRawHistory(epic);

        return {
            bid: this.mapToCandles(rawHistory, TRADING.CHART_DATA_SOURCE_BID),
            ask: this.mapToCandles(rawHistory, TRADING.CHART_DATA_SOURCE_OFR)
        };
    }

    private async fetchRawHistory(epic: string): Promise<PriceSnapshot[]> {
        const endDateTime = DateTime.utc();
        const fromUTCDateTime = endDateTime.minus({ minutes: TIME.TOTAL_MINUTES_IN_THE_PAST });

        const params = {
            [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
            [API.MAX_KEY]: API.MAX_ROWS,
            [API.FROM_KEY]: fromUTCDateTime.startOf(TIME.SECOND_KEY).toISO({ suppressMilliseconds: true }).slice(0, -1),
            [API.TO_KEY]: endDateTime.startOf(TIME.SECOND_KEY).toISO({ suppressMilliseconds: true }).slice(0, -1),
        };

        const endpoint = `${API.PRICES_ENDPOINT}/${epic}`;
        const data = await this.client.get<MarketPriceResponse>(endpoint, params);

        return data.prices.sort((a, b) =>
            new Date(a.snapshotTimeUTC).getTime() - new Date(b.snapshotTimeUTC).getTime()
        );
    }

    private mapToCandles(snapshots: PriceSnapshot[], type: ChartData): ChartCandle[] {
        return snapshots.map(p => {
            const isAsk = type === TRADING.CHART_DATA_SOURCE_OFR;
            const target = isAsk ? {
                o: p.openPrice.ask, h: p.highPrice.ask, l: p.lowPrice.ask, c: p.closePrice.ask
            } : {
                o: p.openPrice.bid, h: p.highPrice.bid, l: p.lowPrice.bid, c: p.closePrice.bid
            };

            return {
                time: DateTime.fromISO(p.snapshotTimeUTC, { zone: TIME.UTC_ZONE }).toSeconds() as UTCTimestamp,
                open: target.o,
                high: target.h,
                low: target.l,
                close: target.c
            };
        });
    }
}