import { type ISeriesApi, type IPriceLine, LineStyle } from "lightweight-charts";
import type { PositionResponse } from "$lib/types/trading.js";
import * as CHART from "$lib/constants/chart.js";
import { formatTimestampToLocalTime } from "$lib/utils/time.js";
import { DateTime } from "luxon";

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private entryLine: IPriceLine | null = null;
    private tpLine: IPriceLine | null = null;
    private slLine: IPriceLine | null = null;

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    update(position: PositionResponse | null) {
        if (!this.series) return;

        this.clear();

        if (!position) return;

        const p = position.position;
        const initialBalance = p.initialBalance || 0;
        const hasValidInitialBalance = initialBalance !== 0;

        const directionText = p.direction === "BUY" ? "You bought" : "You sold";
        let startingTitle = `${directionText} ${p.size} ${position.market.epic}`;

        if (p.createdDateUTC) {
            const dateSeconds = DateTime.fromISO(p.createdDateUTC, { zone: "utc" }).toSeconds();
            const tradeTime = formatTimestampToLocalTime(dateSeconds as any);
            startingTitle += ` at ${tradeTime}`;
        }

        this.entryLine = this.series.createPriceLine({
            price: p.level,
            color: CHART.STARTING_LINE_COLOR || "#FFDD00",
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: startingTitle,
        });

        if (p.profitLevel) {
            const potentialProfit = Math.abs(p.level - p.profitLevel) * p.size;
            let lamboTitle = `Potential Profit +${potentialProfit.toFixed(2)}`;

            if (hasValidInitialBalance) {
                const optimisticBalance = initialBalance + potentialProfit;
                const potentialProfitPercentage = (potentialProfit / initialBalance) * 100;
                const offsetProfitPercentage = (potentialProfitPercentage / (100 + potentialProfitPercentage)) * 100;
                lamboTitle = `Potential Profit +${potentialProfit.toFixed(2)} (${optimisticBalance.toFixed(2)}) (+${potentialProfitPercentage.toFixed(2)}%) (+-${offsetProfitPercentage.toFixed(2)}%)`;
            }

            this.tpLine = this.series.createPriceLine({
                price: p.profitLevel,
                color: CHART.UP_COLOR,
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: lamboTitle,
            });
        }

        if (p.stopLevel) {
            const potentialLoss = Math.abs(p.level - p.stopLevel) * p.size;
            let wendyTitle = `Potential Loss -${potentialLoss.toFixed(2)}`;

            if (hasValidInitialBalance) {
                const pessimisticBalance = initialBalance - potentialLoss;
                const potentialLossPercentage = (potentialLoss / initialBalance) * 100;
                let offsetPercentageText = "";
                if (potentialLossPercentage < 100) {
                    const offsetPercentage = (potentialLossPercentage / (100 - potentialLossPercentage)) * 100;
                    offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
                }
                wendyTitle = `Potential Loss -${potentialLoss.toFixed(2)} (${pessimisticBalance.toFixed(2)}) (-${potentialLossPercentage.toFixed(2)}%)${offsetPercentageText}`;
            }

            this.slLine = this.series.createPriceLine({
                price: p.stopLevel,
                color: CHART.DOWN_COLOR,
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: wendyTitle,
            });
        }
    }

    clear() {
        if (!this.series) return;
        if (this.entryLine) {
            this.series.removePriceLine(this.entryLine);
            this.entryLine = null;
        }
        if (this.tpLine) {
            this.series.removePriceLine(this.tpLine);
            this.tpLine = null;
        }
        if (this.slLine) {
            this.series.removePriceLine(this.slLine);
            this.slLine = null;
        }
    }
}