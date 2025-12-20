import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { connectToStream } from "$lib/services/stream.js";
import { getHistoricalPrices } from "$lib/services/market.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, ChartCandle } from "$lib/types/market.js";
import * as TRADING from "$lib/constants/trading.js";
import type { PositionResponse } from "$lib/types/trading.js";
import { getBaseSeriesOptions } from "$lib/utils/chart.js";
import { roundDownToFactor } from "$lib/utils/trading.js";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: { destroy: () => void } | null = null;
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
        dataSource: typeof TRADING.CHART_DATA_SOURCE_BID | typeof TRADING.CHART_DATA_SOURCE_OFR,
        decimalPlaces: number,
        activePosition: PositionResponse | null
    ) {
        this.series = series;
        this.dataSource = dataSource;
        this.decimalPlaces = decimalPlaces;

        this.stream = connectToStream(tokens, epic, (msg) => this.handleStreamMessage(msg, activePosition));

        const data = await getHistoricalPrices(tokens, epic, dataSource);

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
            this.stream.destroy();
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
            let profitOrLoss: number;

            if (p.direction === TRADING.BUY_DIRECTION) {
                profitOrLoss = (this.currentBid - p.level) * p.size;
            } else {
                profitOrLoss = (p.level - this.currentOfr) * p.size;
            }

            const PLUS = "+";
            const MINUS = "-";
            const profitOrLossSign = profitOrLoss >= 0 ? PLUS : MINUS;
            const priceLineColor = profitOrLoss >= 0 ? "#22958a" : "#bf4240";

            const profitOrLossRounded = roundDownToFactor(Math.abs(profitOrLoss), TRADING.ACCOUNT_USD_PRICE_PRECISION).toFixed(2);

            let title = `${profitOrLossSign}${profitOrLossRounded}`;

            if (p.initialBalance && p.initialBalance > 0) {
                const currentBalance = p.initialBalance + profitOrLoss;
                const percentage = (profitOrLoss / p.initialBalance) * 100;
                const percentageRounded = Math.abs(percentage).toFixed(2);

                let offsetPercentageText = "";
                if (percentage >= 0) {
                    const offsetPercentage = (percentage / (100 + percentage)) * 100;
                    offsetPercentageText = ` (+-${offsetPercentage.toFixed(2)}%)`;
                } else {
                    const absPercentage = Math.abs(percentage);
                    if (absPercentage < 100) {
                        const offsetPercentage = (absPercentage / (100 - absPercentage)) * 100;
                        offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
                    }
                }
                title = `${profitOrLossSign}${profitOrLossRounded} (${currentBalance.toFixed(2)}) (${profitOrLossSign}${percentageRounded}%)${offsetPercentageText}`;
            }

            this.series.applyOptions({
                priceLineColor,
                title,
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