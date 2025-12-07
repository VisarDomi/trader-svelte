import { ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';

export function getOptions(width: number, height: number) {
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
