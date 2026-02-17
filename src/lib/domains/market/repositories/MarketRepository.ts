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

    /**
     * Fetch initial history (Latest N candles)
     */
    async getHistory(epic: string): Promise<{ bid: ChartCandle[], ask: ChartCandle[] }> {
        // "TO" is Now.
        const toStr = this.formatDateForApi(DateTime.utc());
        log.info(`[MarketRepository] Fetching INITIAL history for ${epic} up to ${toStr}`);
        return this.fetchAndMap(epic, toStr);
    }

    /**
     * Fetch older history (N candles BEFORE a specific time)
     */
    async getHistoryBefore(epic: string, beforeTime: UTCTimestamp): Promise<{ bid: ChartCandle[], ask: ChartCandle[] }> {
        // Convert Timestamp to ISO for API
        const dt = DateTime.fromSeconds(beforeTime, { zone: 'utc' });
        const toStr = this.formatDateForApi(dt);

        log.info(`[MarketRepository] Fetching OLDER history for ${epic} ending at ${toStr} (Unix: ${beforeTime})`);
        return this.fetchAndMap(epic, toStr);
    }

    private formatDateForApi(dt: DateTime): string {
        // MATCHING THE SUCCESSFUL TEST FORMAT: YYYY-MM-DDTHH:mm:ss
        // No Milliseconds, No 'Z' suffix.
        return dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    }

    private async fetchAndMap(epic: string, toStr: string) {
        // CLEVER REQUEST PATTERN:
        // We do NOT send 'from'. We send 'to' and 'max'.
        // The server counts backwards 'max' rows from 'to'.
        const params = {
            [API.RESOLUTION_KEY]: API.RESOLUTION_MINUTE,
            [API.MAX_KEY]: API.MAX_ROWS, // 1000
            [API.TO_KEY]: toStr
        };

        const endpoint = `${API.PRICES_ENDPOINT}/${epic}`;

        try {
            // Debug Log
            log.info(`[MarketRepository] GET ${endpoint}`, JSON.stringify(params));

            const data = await this.client.get<MarketPriceResponse>(endpoint, params);

            // Handle 404/Empty by returning empty lists (handled gracefully by pump)
            if (!data.prices || data.prices.length === 0) {
                log.warn("[MarketRepository] Received 0 prices.");
                return { bid: [], ask: [] };
            }

            // Sort ascending (Oldest -> Newest) because API might return them descending or mixed
            const sorted = data.prices.sort((a, b) =>
                new Date(a.snapshotTimeUTC).getTime() - new Date(b.snapshotTimeUTC).getTime()
            );

            const first = sorted[0].snapshotTimeUTC;
            const last = sorted[sorted.length - 1].snapshotTimeUTC;
            log.info(`[MarketRepository] Received ${data.prices.length} candles. Range: ${first} -> ${last}`);

            return {
                bid: this.mapToCandles(sorted, TRADING.CHART_DATA_SOURCE_BID),
                ask: this.mapToCandles(sorted, TRADING.CHART_DATA_SOURCE_OFR)
            };

        } catch (e) {
            // If 404 or bad request, assume end of history or format error
            // We log the full error now to debug 'error.invalid.to' specifically
            log.error("[MarketRepository] Fetch failed details:", e);
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

            // Safety: Ensure valid numbers
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