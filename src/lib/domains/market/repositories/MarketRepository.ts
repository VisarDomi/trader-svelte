import type { ApiClient } from '$lib/core/api/ApiClient.js';
import * as API from '$lib/shared/constants/api.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { DateTime } from "luxon";
import type { UTCTimestamp } from 'lightweight-charts';
import type {
    MarketPriceResponse,
    PriceSnapshot,
    ChartCandle
} from '$lib/shared/types/market.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import { log } from '$lib/shared/utils/log.js';

export class MarketRepository {
    constructor(private client: ApiClient) {}

    async getHistory(epic: string, signal?: AbortSignal): Promise<{ bid: ChartCandle[], ask: ChartCandle[] }> {
        const toStr = this.formatDateForApi(DateTime.utc());
        return this.fetchAndMap(epic, toStr, signal);
    }

    async getHistoryBefore(epic: string, beforeTime: UTCTimestamp, signal?: AbortSignal): Promise<{ bid: ChartCandle[], ask: ChartCandle[] }> {
        const dt = DateTime.fromSeconds(beforeTime, { zone: 'utc' });
        const toStr = this.formatDateForApi(dt);
        return this.fetchAndMap(epic, toStr, signal);
    }

    private formatDateForApi(dt: DateTime): string {
        return dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    }

    private async fetchAndMap(epic: string, toStr: string, signal?: AbortSignal) {
        const params = {
            [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
            [API.MAX_KEY]: API.MAX_ROWS,
            [API.TO_KEY]: toStr
        };

        const endpoint = `${API.PRICES_ENDPOINT}/${epic}`;

        try {
            const data = await this.client.get<MarketPriceResponse>(endpoint, params, signal);

            if (!data.prices || data.prices.length === 0) {
                log.warn("[MarketRepository] Received 0 prices.");
                return { bid: [], ask: [] };
            }

            const sorted = data.prices.sort((a, b) =>
                new Date(a.snapshotTimeUTC).getTime() - new Date(b.snapshotTimeUTC).getTime()
            );

            return {
                bid: this.mapToCandles(sorted, TRADING.CHART_DATA_SOURCE_BID),
                ask: this.mapToCandles(sorted, TRADING.CHART_DATA_SOURCE_OFR)
            };

        } catch (e) {
            log.error("[MarketRepository] Fetch failed:", e);
            return { bid: [], ask: [] };
        }
    }

    private mapToCandles(snapshots: PriceSnapshot[], type: ChartData): ChartCandle[] {
        return snapshots.map(p => {
            const isAsk = type === TRADING.CHART_DATA_SOURCE_OFR;
            const target = isAsk ? {
                o: p.openPrice.ask, h: p.highPrice.ask, l: p.lowPrice.ask, c: p.closePrice.ask
            } : {
                o: p.openPrice.bid, h: p.highPrice.bid, l: p.lowPrice.bid, c: p.closePrice.bid
            };

            const close = target.c || 0;
            const open = target.o || close;
            const high = target.h || Math.max(open, close);
            const low = target.l || Math.min(open, close);

            return {
                time: DateTime.fromISO(p.snapshotTimeUTC, { zone: 'utc' }).toSeconds() as UTCTimestamp,
                open,
                high,
                low,
                close
            };
        });
    }
}
