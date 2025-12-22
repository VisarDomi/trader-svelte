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
import { formatTimestampToLocalTime } from "$lib/utils/time.js";
import * as CHART from "$lib/constants/chart.js";
import * as TIME from "$lib/constants/time";

export interface ChartLayoutConfig {
    width: number;
    height: number;
    isPwa: boolean;
    isMobile: boolean;
    isLandscape: boolean;
}

export function getTimeScaleHeight(isPwa: boolean, isLandscape: boolean): number {
    let timeScaleHeight = isPwa ? 60 : 90;
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
            type: CHART.PRICE_FORMAT_TYPE
        },
        upColor: CHART.UP_COLOR,
        downColor: CHART.DOWN_COLOR,
        borderVisible: false,
        wickUpColor: CHART.UP_COLOR,
        wickDownColor: CHART.DOWN_COLOR,
        title: CHART.BASE_SERIES_TITLE,
    };
}

export function getChartOptions(config: ChartLayoutConfig): DeepPartial<ChartOptions> {
    const { width, height, isPwa, isMobile, isLandscape } = config;

    const timeScale: DeepPartial<TimeScaleOptions> = {
        tickMarkFormatter: (time: Time) => {
            return formatTimestampToLocalTime(time as UTCTimestamp);
        },
        rightOffset: CHART.RIGHT_OFFSET,
        barSpacing: isMobile ? CHART.MOBILE_BAR_SPACING : CHART.BAR_SPACING,
        minBarSpacing: CHART.MIN_BAR_SPACING,
        borderColor: CHART.BORDER_COLOR,
        minimumHeight: getTimeScaleHeight(isPwa, isLandscape),
        timeVisible: true,
        secondsVisible: false,
    };

    const localization: DeepPartial<LocalizationOptions<Time>> = {
        timeFormatter: (time: Time) => {
            const wsTime = DateTime.fromSeconds(time as number, { zone: "system" });
            return wsTime.toFormat(TIME.DATETIME_FORMAT);
        },
    };

    const rightPriceScale: DeepPartial<VisiblePriceScaleOptions> = {
        borderColor: CHART.BORDER_COLOR,
        visible: true,
    };

    const crosshair: DeepPartial<CrosshairOptions> = {
        mode: CrosshairMode.Normal,
        vertLine: {
            color: CHART.CROSSHAIR_COLOR,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: CHART.CROSSHAIR_LABEL_BG,
        },
        horzLine: {
            color: CHART.CROSSHAIR_COLOR,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: CHART.CROSSHAIR_LABEL_BG,
        },
    };

    const grid: DeepPartial<GridOptions> = {
        vertLines: {
            color: CHART.GRID_COLOR,
        },
        horzLines: {
            color: CHART.GRID_COLOR,
        },
    };

    const layout: DeepPartial<LayoutOptions> = {
        background: {
            type: ColorType.Solid,
            color: CHART.BACKGROUND_COLOR,
        },
        textColor: CHART.TEXT_COLOR,
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