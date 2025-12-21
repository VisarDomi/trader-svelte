import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { StreamClient } from "$lib/api/stream.js";
import { getHistoricalPrices } from "$lib/services/market.js";
import { ApiClient } from '$lib/api/client.js';
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, ChartCandle } from "$lib/types/market.js";
import * as TRADING from "$lib/constants/trading.js";
import * as AUTH from '$lib/constants/auth.js';
import type { ChartData, PositionResponse } from "$lib/types/trading.js";
import { getBaseSeriesOptions } from "$lib/utils/chart.js";
import { generateCurrentLine } from "$lib/utils/lines.js";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: StreamClient | null = null;
    private historicalLoaded = false;
    private liveBuffer: QuoteMessage[] = [];
    private currentCandle: ChartCandle | null = null;
    private dataSource = TRADING.CHART_DATA_SOURCE_BID;
    private decimalPlaces = 2;

    currentBid = $state(0);
    currentOfr = $state(0);

    async init(
        tokens: SessionTokens,
        epic: string,
        series: ISeriesApi<"Candlestick">,
        dataSource: ChartData,
        decimalPlaces: number,
        activePosition: PositionResponse | null
    ) {
        this.series = series;
        this.dataSource = dataSource;
        this.decimalPlaces = decimalPlaces;

        // Init Stream
        this.stream = new StreamClient(tokens, epic, (msg) => this.handleStreamMessage(msg, activePosition));
        this.stream.connect();

        // Fetch Historical
        const client = new ApiClient(AUTH.REAL_TYPE, tokens);
        const data = await getHistoricalPrices(client, epic, dataSource);

        this.series.setData(data);
        if (data.length > 0) {
            this.currentCandle = data[data.length - 1];
            if (this.currentBid === 0) this.currentBid = this.currentCandle.close;
            if (this.currentOfr === 0) this.currentOfr = this.currentCandle.close;
        }

        this.historicalLoaded = true;
        this.processBuffer(activePosition);
    }

    destroy() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
    }

    private handleStreamMessage(msg: QuoteMessage, activePosition: PositionResponse | null) {
        this.currentBid = msg.payload.bid;
        this.currentOfr = msg.payload.ofr;

        if (!this.historicalLoaded) {
            this.liveBuffer.push(msg);
        } else {
            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? msg.payload.ofr : msg.payload.bid;
            this.processTick(price, msg.payload.timestamp);
            this.updatePnLDisplay(activePosition);
        }
    }

    private processBuffer(activePosition: PositionResponse | null) {
        for (const msg of this.liveBuffer) {
            this.currentBid = msg.payload.bid;
            this.currentOfr = msg.payload.ofr;
            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? msg.payload.ofr : msg.payload.bid;
            this.processTick(price, msg.payload.timestamp);
        }
        this.liveBuffer = [];
        this.updatePnLDisplay(activePosition);
    }

    private updatePnLDisplay(position: PositionResponse | null) {
        if (!this.series) return;

        if (position) {
            const p = position.position;
            const initialBalance = p.initialBalance || 0;

            const currentPrice = p.direction === TRADING.BUY_DIRECTION ? this.currentBid : this.currentOfr;
            const lineInfo = generateCurrentLine(p, currentPrice, initialBalance);

            const priceLineColor = lineInfo.isProfit ? "#22958a" : "#bf4240";

            this.series.applyOptions({
                priceLineColor,
                title: lineInfo.title,
            } as any);
        } else {
            this.series.applyOptions(getBaseSeriesOptions(Math.pow(10, this.decimalPlaces)));
        }
    }

    private processTick(price: number, timestampMs: number) {
        if (!this.series) return;
        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;
        if (!this.currentCandle) {
            this.currentCandle = { time, open: price, high: price, low: price, close: price };
        } else if (time === this.currentCandle.time) {
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
        } else if (time > this.currentCandle.time) {
            this.currentCandle = {
                time,
                open: price,
                high: price,
                low: price,
                close: price
            };
        }
        this.series.update(this.currentCandle);
    }
}