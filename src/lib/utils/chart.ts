import {
    ColorType,
    CrosshairMode,
    LineStyle,
    type CandlestickSeriesPartialOptions,
    type ChartOptions,
    type DeepPartial,
    type GridOptions,
    type LayoutOptions,
    type LocalizationOptions,
    type Time,
    type TimeScaleOptions,
    type UTCTimestamp,
    type VisiblePriceScaleOptions,
    type CrosshairOptions
} from "lightweight-charts";
import { DateTime } from "luxon";
import * as CHART_CONST from "$lib/constants/chart";
import { formatTimestampToLocalTime } from "$lib/utils/time";

export function getTimeScaleHeight(): number {
    if (typeof window === 'undefined') return 50;

    const isPWA = window.matchMedia("(display-mode: standalone)").matches;
    const isLandscape = window.innerHeight < window.innerWidth;
    let timeScaleHeight = isPWA ? 60 : 90;

    if (isLandscape) {
        timeScaleHeight /= 2;
    }

    return timeScaleHeight;
}

export function getBaseSeriesOptions(pricePrecision: number): CandlestickSeriesPartialOptions {
    return {
        priceLineStyle: LineStyle.SparseDotted,
        priceFormat: {
            minMove: 1 / pricePrecision,
            precision: Math.log10(pricePrecision),
            type: 'price'
        },
        upColor: CHART_CONST.UP_COLOR,
        downColor: CHART_CONST.DOWN_COLOR,
        borderVisible: false,
        wickUpColor: CHART_CONST.UP_COLOR,
        wickDownColor: CHART_CONST.DOWN_COLOR,
        title: "Current Price",
    };
}

export function getChartOptions(width: number, height: number): DeepPartial<ChartOptions> {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    const timeScale: DeepPartial<TimeScaleOptions> = {
        tickMarkFormatter: (time: Time) => {
            return formatTimestampToLocalTime(time as UTCTimestamp);
        },
        rightOffset: 0,
        barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING,
        minBarSpacing: CHART_CONST.MIN_BAR_SPACING,
        borderColor: CHART_CONST.BORDER_COLOR,
        minimumHeight: getTimeScaleHeight(),
        timeVisible: true,
        secondsVisible: false,
    };

    const localization: DeepPartial<LocalizationOptions<Time>> = {
        timeFormatter: (time: Time) => {
            const wsTime = DateTime.fromSeconds(time as number, { zone: "system" });
            return wsTime.toFormat("yyyy-MM-dd HH:mm");
        },
    };

    const rightPriceScale: DeepPartial<VisiblePriceScaleOptions> = {
        borderColor: CHART_CONST.BORDER_COLOR,
        visible: true,
    };

    const crosshair: DeepPartial<CrosshairOptions> = {
        mode: CrosshairMode.Normal,
        vertLine: {
            color: CHART_CONST.CROSSHAIR_COLOR,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: CHART_CONST.CROSSHAIR_LABEL_BG,
        },
        horzLine: {
            color: CHART_CONST.CROSSHAIR_COLOR,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: CHART_CONST.CROSSHAIR_LABEL_BG,
        },
    };

    const grid: DeepPartial<GridOptions> = {
        vertLines: {
            color: CHART_CONST.GRID_COLOR,
        },
        horzLines: {
            color: CHART_CONST.GRID_COLOR,
        },
    };

    const layout: DeepPartial<LayoutOptions> = {
        background: {
            type: ColorType.Solid,
            color: CHART_CONST.BACKGROUND_COLOR,
        },
        textColor: CHART_CONST.TEXT_COLOR,
    };

    return {
        width,
        height,
        timeScale,
        rightPriceScale,
        localization,
        crosshair,
        grid,
        layout,
    };
}