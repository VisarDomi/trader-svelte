import {
    ColorType,
    CrosshairMode,
    LineStyle,
    type DeepPartial,
    type ChartOptions,
    type CandlestickSeriesOptions
} from 'lightweight-charts';

export function getChartOptions(width: number, height: number): DeepPartial<ChartOptions> {
    return {
        width,
        height,
        layout: {
            background: { type: ColorType.Solid, color: '#0f0f1a' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: '#262630' },
            horzLines: { color: '#262630' },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
                color: '#808080',
                style: LineStyle.LargeDashed,
                labelBackgroundColor: '#696969',
            },
            horzLine: {
                color: '#808080',
                style: LineStyle.LargeDashed,
                labelBackgroundColor: '#696969',
            },
        },
        rightPriceScale: {
            borderColor: '#3e3e47',
        },
        timeScale: {
            borderColor: '#3e3e47',
            timeVisible: true,
            secondsVisible: false,
        },
    };
}

export function getSeriesOptions(precision: number): DeepPartial<CandlestickSeriesOptions> {
    return {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        priceFormat: {
            type: 'price',
            precision: precision,
            minMove: 1 / Math.pow(10, precision),
        },
    };
}