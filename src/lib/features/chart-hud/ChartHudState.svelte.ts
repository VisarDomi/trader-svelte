import { goto } from '$app/navigation';
import { getMarketDetails } from '$lib/domains/market/services/MarketApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { SessionManager } from '$lib/core/services/SessionManager.js';
import type { ChartLogic } from '$lib/features/chart-orchestration/ChartLogic.svelte.js';

export class ChartOverlay {
    isOpen = $state(false);
    marketName = $state('');
    debugText = $state('');
    private debugInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly accountStore: AccountStore,
        private readonly positionStore: PositionStore,
        private readonly session: SessionManager,
        private readonly chartLogic: ChartLogic
    ) {
        this.debugInterval = setInterval(() => this.updateDebug(), 500);
    }

    get modeColor() {
        return this.session.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350';
    }

    get hasActiveAccount() {
        return !!this.accountStore.activeAccount;
    }

    get accountName() {
        return this.accountStore.activeAccount?.accountName ?? '—';
    }

    get accountBalanceDisplay() {
        const a = this.accountStore.activeAccount;
        if (!a) return '—';
        return `${a.symbol}${a.balance.deposit.toFixed(2)}`;
    }

    get currentMode() {
        return this.session.mode;
    }

    get hasPosition() {
        return !!this.positionStore.anyActivePosition;
    }

    get positionDirection() {
        return this.positionStore.anyActivePosition?.position.direction ?? '';
    }

    get positionSize() {
        return this.positionStore.anyActivePosition?.position.size ?? 0;
    }

    get positionColor() {
        const dir = this.positionStore.anyActivePosition?.position.direction;
        return dir === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350';
    }

    get isClosingPosition() {
        return this.positionStore.isClosing;
    }

    async init(epic: string) {
        const client = api.client;
        if (client) {
            try {
                const md = await getMarketDetails(client, epic);
                this.marketName = md.instrument.name;
            } catch {
                this.marketName = epic;
            }
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }

    resetChart() {

        this.chartLogic.resetChartZoom();
    }

    navToInstrument() {
        void goto('/instrument');
    }

    navToAccounts() {
        const activeId = this.accountStore.activeAccount?.accountId;
        const url = activeId ? `/accounts#${activeId}` : '/accounts';
        void goto(url);
    }

    navToPosition() {
        void goto('/position');
    }

    closePosition() {
        void this.positionStore.close();
    }

    logSnapshot() {
        const snap = this.readChart();
        if (snap) {
            serverLog({ tag: LogEvent.ChartResize, phase: 'manual-snapshot', ...snap });
        }
    }

    destroy() {
        if (this.debugInterval) clearInterval(this.debugInterval);
    }

    private readChart(): Record<string, unknown> | null {
        try {
            const chart = this.chartLogic.controller.chart;
            const series = this.chartLogic.controller.series;
            const ts = chart.timeScale();
            const timeRange = ts.getVisibleRange();
            const priceRange = chart.priceScale('right').getVisibleRange();
            const lr = ts.getVisibleLogicalRange();

            const toTime = (t: number) => {
                const d = new Date(t * 1000);
                return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            };

            const pixelTop = series.coordinateToPrice(0);
            const pixelBot = series.coordinateToPrice(chart.chartElement().clientHeight);

            return {
                bs: Math.round(ts.options().barSpacing * 100) / 100,
                tsW: ts.width(),
                bars: lr ? Math.round(lr.to - lr.from) : 0,
                tL: timeRange ? toTime(timeRange.from as number) : '-',
                tR: timeRange ? toTime(timeRange.to as number) : '-',
                apiT: priceRange ? Math.round(priceRange.to) : 0,
                apiB: priceRange ? Math.round(priceRange.from) : 0,
                pxT: pixelTop ? Math.round(pixelTop) : 0,
                pxB: pixelBot ? Math.round(pixelBot) : 0,
                w: window.innerWidth,
                h: window.innerHeight,
            };
        } catch {
            return null;
        }
    }

    private updateDebug() {
        const snap = this.readChart();
        if (!snap) { this.debugText = ''; return; }
        this.debugText = `api:${snap.apiT}—${snap.apiB} px:${snap.pxT}—${snap.pxB} | ${snap.tL}—${snap.tR} | ${snap.w}x${snap.h}`;
    }
}
