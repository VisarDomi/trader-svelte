import type { IChartApi, ISeriesApi, LogicalRange } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { marketDataPump } from "$lib/domains/market/services/MarketDataPump.js";
import { marketStore } from "$lib/domains/market/stores/MarketStore.svelte.js";

export class HistoryLoaderPlugin implements Types {
    id = "history_loader";

    private chart: IChartApi | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.chart = chart;
        chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleRangeChange);
    }

    update(context: any): void {

    }

    destroy(): void {
        if (this.chart) {
            this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleRangeChange);
            this.chart = null;
        }
    }

    private handleRangeChange = (range: LogicalRange | null) => {
        if (!range || !this.chart) return;

        if (range.from < 20 && !marketDataPump.isLoadingHistory && !marketDataPump.isHistoryExhausted) {

            void marketDataPump.loadMoreHistory();
        }
    };
}
