<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { goto } from '$app/navigation';
    import * as AUTH_CONST from '$lib/constants/auth.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as EVENTS from '$lib/constants/events.js';
    import { login } from "$lib/services/auth";
    import { page } from '$app/state';
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
    import { getHistoricalPrices } from "$lib/services/market";
    import { connectToStream } from "$lib/services/stream";
    import { getChartOptions, getBaseSeriesOptions, getTimeScaleHeight } from "$lib/utils/chart";
    import { getStoredDimensions, removeTradingViewLogo } from "$lib/utils/helpers";
    import type { SessionTokens } from "$lib/types/auth";
    import type { ChartCandle, QuoteMessage } from "$lib/types/market";
    import { DEFAULT_ERROR } from "$lib/constants/error";

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;
    let candleSeries: ISeriesApi<"Candlestick">;
    let streamConnection: { destroy: () => void } | null = null;

    let isDataLoaded = false;
    let historicalLoaded = false;

    let liveBuffer: QuoteMessage[] = [];
    let currentCandle: ChartCandle | null = null;

    const epic = page.url.searchParams.get('epic') || TRADING.NDX_EPIC;

    function updateChartDimensions() {
        if (!chartContainer || !chart) return;

        let width: number;
        let height: number;
        const windowHeight = window.innerHeight;

        if (!isDataLoaded) {
            width = window.innerWidth;
            height = windowHeight;
        } else {
            const dims = getStoredDimensions();
            width = dims.width;
            height = dims.height;
        }

        chartContainer.style.width = `${width}px`;
        chartContainer.style.height = `${height}px`;
        chart.resize(width, height);

        const isMobile = window.innerWidth <= 768;
        chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });

        if (isDataLoaded) {
            const heightDiff = height - windowHeight;
            const scrollTarget = CHART_CONST.TOPBAR_HEIGHT + heightDiff;
            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
    }

    function processTick(price: number, timestampMs: number) {
        if (!candleSeries) return;

        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;

        if (!currentCandle) {
            currentCandle = { time, open: price, high: price, low: price, close: price };
        } else if (time === currentCandle.time) {
            currentCandle.high = Math.max(currentCandle.high, price);
            currentCandle.low = Math.min(currentCandle.low, price);
            currentCandle.close = price;
        } else if (time > currentCandle.time) {
            currentCandle = {
                time,
                open: price,
                high: price,
                low: price,
                close: price
            };
        }

        candleSeries.update(currentCandle);
    }

    onMount(async () => {
        try {
            const [realTokens, demoTokens] = await Promise.all([
                login(AUTH_CONST.REAL_TYPE),
                login(AUTH_CONST.DEMO_TYPE)
            ]);
            localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(realTokens));
            localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(demoTokens));
        } catch (ignore) {
            await goto('/login');
        }

        const initialWidth = window.innerWidth;
        const initialHeight = window.innerHeight;

        chartContainer.style.width = `${initialWidth}px`;
        chartContainer.style.height = `${initialHeight}px`;

        window.addEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);

        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) throw new Error(DEFAULT_ERROR);
        const tokens: SessionTokens = JSON.parse(tokensData);

        const chartOptions = getChartOptions(initialWidth, initialHeight);
        chart = createChart(chartContainer, chartOptions);

        const seriesOptions = getBaseSeriesOptions(TRADING.NDX_PRICE_PRECISION);
        candleSeries = chart.addSeries(CandlestickSeries, seriesOptions);

        streamConnection = connectToStream(tokens, epic, (msg: QuoteMessage) => {
            if (!historicalLoaded) {
                liveBuffer.push(msg);
            } else {
                processTick(msg.payload.bid, msg.payload.timestamp);
            }
        });

        const data = await getHistoricalPrices(tokens, epic);

        candleSeries.setData(data);

        if (data.length > 0) {
            currentCandle = data[data.length - 1];
        }

        historicalLoaded = true;

        for (const msg of liveBuffer) {
            processTick(msg.payload.bid, msg.payload.timestamp);
        }
        liveBuffer = [];

        removeTradingViewLogo();

        isDataLoaded = true;
        await tick();
        updateChartDimensions();
    });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
            window.removeEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);
        }
        if (streamConnection) {
            streamConnection.destroy();
        }
        if (chart) {
            chart.remove();
        }
    });
</script>

{#if isDataLoaded}
    <div
            id={CHART_CONST.TOPBAR_ID}
            style="height: {CHART_CONST.TOPBAR_HEIGHT}px; background-color: {CHART_CONST.BACKGROUND_COLOR};"
    >
    </div>
{/if}

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>