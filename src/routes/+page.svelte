<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
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
    import {getStoredDimensions, removeTradingViewLogo} from "$lib/utils/helpers";
    import type { SessionTokens } from "$lib/types/auth";
    import {DEFAULT_ERROR} from "$lib/constants/error";

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;
    let candleSeries: ISeriesApi<"Candlestick">;

    const epic = page.url.searchParams.get('epic') || TRADING.NDX_EPIC;

    function updateChartDimensions() {
        const { width, height } = getStoredDimensions();

        if (chartContainer) {
            chartContainer.style.width = `${width}px`;
            chartContainer.style.height = `${height}px`;
        }

        if (chart) {
            chart.resize(width, height);
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

        updateChartDimensions();
        window.addEventListener(EVENTS.WINDOW_RESIZE, updateChartDimensions);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, updateChartDimensions);

        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) {
            throw new Error(DEFAULT_ERROR)
        }

        const tokens: SessionTokens = JSON.parse(tokensData);

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
        removeTradingViewLogo();
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

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>
