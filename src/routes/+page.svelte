<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { goto } from '$app/navigation';
    import * as AUTH_CONST from '$lib/constants/auth.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as EVENTS from '$lib/constants/events.js';
    import { login } from "$lib/services/auth";
    import { getCredentials } from "$lib/services/credentials";
    import { page } from '$app/state';
    import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';
    import type { IChartApi, ISeriesApi, TimeScaleOptions, LocalizationOptions, DeepPartial, Time, UTCTimestamp } from 'lightweight-charts';
    import { getHistoricalPrices } from "$lib/services/market";
    import { connectToStream } from "$lib/services/stream";
    import { formatTimestampToLocalTime, formatChartTimeFull } from "$lib/utils/time";
    import { getTimeScaleHeight } from "$lib/utils/chart";
    import { getStoredDimensions, removeTradingViewLogo } from "$lib/utils/helpers";
    import type { SessionTokens } from "$lib/types/auth";
    import type { ChartCandle, QuoteMessage } from "$lib/types/market";
    import { DEFAULT_ERROR } from "$lib/constants/error";

    let chartContainer: HTMLDivElement;
    let topBar: HTMLDivElement;
    let chart: IChartApi;
    let candleSeries: ISeriesApi<"Candlestick">;
    let streamConnection: { destroy: () => void } | null = null;

    let isDataLoaded = false;
    let historicalLoaded = false;

    // Live Data Management
    let liveBuffer: QuoteMessage[] = [];
    let currentCandle: ChartCandle | null = null;

    const TOPBAR_HEIGHT = 200;
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

        if (isDataLoaded) {
            const heightDiff = height - windowHeight;
            const scrollTarget = TOPBAR_HEIGHT + heightDiff;
            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
    }

    // Handles a single price update tick
    // Can be called from the buffer loop or live stream
    function processTick(price: number, timestampMs: number) {
        if (!candleSeries) return;

        // Convert ms to seconds (UTC Timestamp) and floor to minute
        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;

        if (!currentCandle) {
            // Should not happen if history loaded correctly, but fail-safe
            currentCandle = { time, open: price, high: price, low: price, close: price };
        } else if (time === currentCandle.time) {
            // Update existing candle
            currentCandle.high = Math.max(currentCandle.high, price);
            currentCandle.low = Math.min(currentCandle.low, price);
            currentCandle.close = price;
        } else if (time > currentCandle.time) {
            // New minute started
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
            getCredentials();
            const [realTokens, demoTokens] = await Promise.all([
                login(AUTH_CONST.REAL_TYPE),
                login(AUTH_CONST.DEMO_TYPE)
            ]);
            localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(realTokens));
            localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(demoTokens));
        } catch (ignore) {
            await goto('/login');
        }

        updateChartDimensions();

        window.addEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);

        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) throw new Error(DEFAULT_ERROR);
        const tokens: SessionTokens = JSON.parse(tokensData);

        // --- Chart Init ---
        const timeScaleOptions: DeepPartial<TimeScaleOptions> = {
            tickMarkFormatter: (time: Time) => formatTimestampToLocalTime(time as UTCTimestamp),
            rightOffset: CHART_CONST.RIGHT_OFFSET,
            barSpacing: CHART_CONST.BAR_SPACING,
            minBarSpacing: CHART_CONST.MIN_BAR_SPACING,
            borderColor: CHART_CONST.TIME_SCALE_BORDER_COLOR,
            minimumHeight: getTimeScaleHeight(),
            timeVisible: true,
            secondsVisible: false,
        };

        const localizationOptions: DeepPartial<LocalizationOptions<Time>> = {
            timeFormatter: (time: Time) => formatChartTimeFull(time as UTCTimestamp),
        };

        chart = createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
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

        // --- 1. Start WebSocket (Parallel) ---
        // We start listening immediately. If history isn't ready, we buffer.
        streamConnection = connectToStream(tokens, epic, (msg: QuoteMessage) => {
            if (!historicalLoaded) {
                liveBuffer.push(msg);
            } else {
                // Direct update
                // Use BID to match historical data consistency
                processTick(msg.payload.bid, msg.payload.timestamp);
            }
        });

        // --- 2. Fetch Historical Data ---
        const data = await getHistoricalPrices(tokens, epic);

        // --- 3. Populate Chart ---
        candleSeries.setData(data);

        // Initialize currentCandle from the last historical entry
        if (data.length > 0) {
            currentCandle = data[data.length - 1];
        }

        historicalLoaded = true;

        // --- 4. Process Buffer (Smooth Transition) ---
        // Replay any ticks we missed while waiting for history
        for (const msg of liveBuffer) {
            processTick(msg.payload.bid, msg.payload.timestamp);
        }
        liveBuffer = []; // Clear buffer

        removeTradingViewLogo();

        // --- 5. UI Layout Transition ---
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
            bind:this={topBar}
            id="topbar"
            style="height: {TOPBAR_HEIGHT}px; background-color: blue;"
    >
    </div>
{/if}

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>