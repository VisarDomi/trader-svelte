import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { StreamClient } from "$lib/api/stream.js";
import { getHistoricalPrices } from "$lib/services/market.js";
import { ApiClient } from '$lib/api/client.js';
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, ChartCandle } from "$lib/types/market.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";
import * as AUTH from '$lib/constants/auth.js';
import type { ChartData, PositionResponse } from "$lib/types/trading.js";
import { getBaseSeriesOptions } from "$lib/utils/chart.js";
import { generateCurrentLine } from "$lib/utils/lines.js";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: StreamClient | null = null;
    private historicalLoaded = false;
    private currentCandle: ChartCandle | null = null;
    private dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID;
    private decimalPlaces = 2;
    private tokens: SessionTokens | null = null;
    private epic: string = "";
    private _currentPosition: PositionResponse | null = null;

    // Default to empty, will be populated by logic
    private _accountSymbol: string = "";

    currentBid = $state(0);
    currentOfr = $state(0);

    get currentChartPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.currentOfr : this.currentBid;
    }

    set position(p: PositionResponse | null) {
        this._currentPosition = p;
        this.drawPnL(p);
    }

    set accountSymbol(sym: string) {
        this._accountSymbol = sym;
        this.drawPnL(this._currentPosition);
    }

    async initDynamic(
        tokens: SessionTokens,
        epic: string,
        series: ISeriesApi<"Candlestick">,
        dataSource: ChartData,
        decimalPlaces: number,
        activePosition: PositionResponse | null
    ) {
        this.tokens = tokens;
        this.epic = epic;
        this.series = series;
        this.dataSource = dataSource;
        this.decimalPlaces = decimalPlaces;
        this._currentPosition = activePosition;

        if (!this.stream) {
            this.stream = new StreamClient(tokens, epic, (msg) => this.handleStreamMessageDynamic(msg));
            this.stream.connect();
        }

        await this.loadHistory();
        this.drawPnL(activePosition);
    }

    async setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        await this.loadHistory();
    }

    destroy() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
    }

    private async loadHistory() {
        if (!this.tokens || !this.series) return;

        this.historicalLoaded = false;
        this.currentCandle = null;

        const client = new ApiClient(AUTH.REAL_TYPE, this.tokens);
        const data = await getHistoricalPrices(client, this.epic, this.dataSource);

        this.series.setData(data);
        if (data.length > 0) {
            this.currentCandle = data[data.length - 1];
            if (this.currentBid === 0) this.currentBid = this.currentCandle.close;
            if (this.currentOfr === 0) this.currentOfr = this.currentCandle.close;
        }

        this.historicalLoaded = true;
    }

    private handleStreamMessageDynamic(msg: QuoteMessage) {
        this.currentBid = msg.payload.bid;
        this.currentOfr = msg.payload.ofr;

        if (this.historicalLoaded) {
            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? msg.payload.ofr : msg.payload.bid;
            this.processTick(price, msg.payload.timestamp);
            this.drawPnL(this._currentPosition);
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

    private drawPnL(position: PositionResponse | null) {
        if (!this.series) return;

        if (position) {
            const p = position.position;
            const initialBalance = p.initialBalance || 0;
            const isLandscape = viewport.width > viewport.height;

            const currentPrice = p.direction === TRADING.BUY_DIRECTION ? this.currentBid : this.currentOfr;

            const lineInfo = generateCurrentLine(p, currentPrice, initialBalance, this._accountSymbol, isLandscape);

            const priceLineColor = lineInfo.isProfit ? "#22958a" : "#bf4240";

            this.series.applyOptions({
                priceLineColor,
                title: lineInfo.title,
            } as any);
        } else {
            this.series.applyOptions(getBaseSeriesOptions(Math.pow(10, this.decimalPlaces)));
        }
    }

    init(tokens: SessionTokens, epic: string, series: ISeriesApi<"Candlestick">, dataSource: ChartData, decimalPlaces: number, activePosition: PositionResponse | null) {
        return this.initDynamic(tokens, epic, series, dataSource, decimalPlaces, activePosition);
    }
}