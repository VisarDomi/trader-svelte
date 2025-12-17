<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/state';
    import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';
    import type { IChartApi, ISeriesApi, TimeScaleOptions, LocalizationOptions, DeepPartial, Time, UTCTimestamp } from 'lightweight-charts';

    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import { getHistoricalPrices } from "$lib/services/market";
    import { formatTimestampToLocalTime, formatChartTimeFull } from "$lib/utils/time";
    import { getTimeScaleHeight } from "$lib/utils/chart";
    import type { SessionTokens } from "$lib/types/auth";
    import {removeTradingViewLogo} from "$lib/utils/helpers";

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;
    let candleSeries: ISeriesApi<"Candlestick">;
    let errorMsg = $state("");

    const epic = page.url.searchParams.get('epic') || TRADING.NDX_EPIC;

    onMount(async () => {
        removeTradingViewLogo();
        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) {
            errorMsg = "No Real tokens found";
            return;
        }

        const tokens: SessionTokens = JSON.parse(tokensData);

        try {
            const data = await getHistoricalPrices(tokens, epic);

            const timeScaleOptions: DeepPartial<TimeScaleOptions> = {
                tickMarkFormatter: (time: Time) => {
                    return formatTimestampToLocalTime(time as UTCTimestamp);
                },
                rightOffset: CHART_CONST.RIGHT_OFFSET,
                barSpacing: CHART_CONST.BAR_SPACING,
                minBarSpacing: CHART_CONST.MIN_BAR_SPACING,
                borderColor: CHART_CONST.TIME_SCALE_BORDER_COLOR,
                minimumHeight: getTimeScaleHeight(),
                timeVisible: true,
                secondsVisible: false,
            };

            const localizationOptions: DeepPartial<LocalizationOptions<Time>> = {
                timeFormatter: (time: Time) => {
                    return formatChartTimeFull(time as UTCTimestamp);
                },
            };

            chart = createChart(chartContainer, {
                autoSize: true,
                layout: {
                    background: { type: ColorType.Solid, color: CHART_CONST.BACKGROUND_COLOR },
                    textColor: CHART_CONST.TEXT_COLOR,
                },
                grid: {
                    vertLines: { color: CHART_CONST.GRID_COLOR },
                    horzLines: { color: CHART_CONST.GRID_COLOR },
                },
                timeScale: timeScaleOptions,
                localization: localizationOptions
            });

            candleSeries = chart.addSeries(CandlestickSeries, {
                upColor: CHART_CONST.UP_COLOR,
                downColor: CHART_CONST.DOWN_COLOR,
                borderVisible: false,
                wickUpColor: CHART_CONST.UP_COLOR,
                wickDownColor: CHART_CONST.DOWN_COLOR,
            });

            candleSeries.setData(data);

        } catch (e) {
            errorMsg = e instanceof Error ? e.message : "Failed to load chart data";
            console.error(e);
        }
    });

    onDestroy(() => {
        if (chart) {
            chart.remove();
        }
    });
</script>

<div style="width: 100vw; height: 100vh; position: relative; background-color: {CHART_CONST.BACKGROUND_COLOR};">
    {#if errorMsg}
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: red;">
            {errorMsg}
        </div>
    {/if}
    <div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID} style="width: 100%; height: 100%;"></div>
</div>