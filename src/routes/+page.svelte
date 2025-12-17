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
    import { formatTimestampToLocalTime, formatChartTimeFull } from "$lib/utils/time";
    import { getTimeScaleHeight } from "$lib/utils/chart";
    import { getStoredDimensions, removeTradingViewLogo } from "$lib/utils/helpers";
    import type { SessionTokens } from "$lib/types/auth";
    import { DEFAULT_ERROR } from "$lib/constants/error";

    let chartContainer: HTMLDivElement;
    let topBar: HTMLDivElement;
    let chart: IChartApi;
    let candleSeries: ISeriesApi<"Candlestick">;

    let isDataLoaded = false;
    const TOPBAR_HEIGHT = 200;

    const epic = page.url.searchParams.get('epic') || TRADING.NDX_EPIC;

    function updateChartDimensions() {
        if (!chartContainer || !chart) return;

        let width: number;
        let height: number;
        const windowHeight = window.innerHeight;

        if (!isDataLoaded) {
            // Initial state: Fill the current window exactly
            width = window.innerWidth;
            height = windowHeight;
        } else {
            // Data loaded state: Use stored dimensions
            const dims = getStoredDimensions();
            width = dims.width;
            height = dims.height;
        }

        // Apply dimensions to DOM and Chart
        chartContainer.style.width = `${width}px`;
        chartContainer.style.height = `${height}px`;
        chart.resize(width, height);

        // Scroll Logic
        if (isDataLoaded) {
            // Formula: We scroll past the topbar, plus the difference between the
            // chart's full height and the current window height.
            // This effectively aligns the bottom of the chart with the bottom of the screen.
            const heightDiff = height - windowHeight;
            const scrollTarget = TOPBAR_HEIGHT + heightDiff;

            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
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

        // 1. Initial set (Fullscreen)
        updateChartDimensions();

        window.addEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);

        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) {
            throw new Error(DEFAULT_ERROR)
        }

        const tokens: SessionTokens = JSON.parse(tokensData);

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
            // Initial size based on container (which is window size at this point)
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

        // 2. Fetch Data
        const data = await getHistoricalPrices(tokens, epic);

        // 3. Populate
        candleSeries.setData(data);
        removeTradingViewLogo();

        // 4. Update State and Layout
        isDataLoaded = true;

        // Wait for Svelte to render the TopBar into DOM
        await tick();

        // Resize to stored dimensions and apply calculated scroll
        updateChartDimensions();
    });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
            window.removeEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);
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