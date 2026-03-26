import * as STORAGE from '$lib/shared/constants/storage.js';
import type { ChartController } from '$lib/components/chart-engine/ChartController.js';
import type { ViewState } from '$lib/components/chart-engine/ChartCamera.js';
import type { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { log } from '$lib/shared/utils/log.js';

const STALE_VIEW_THRESHOLD_S = 24 * 60 * 60;

interface EnhancedViewState extends ViewState {
    lastDataTimeAtSave: number;
}

export class ChartStateManager {
    private currentEpic = $state("");
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly controller: ChartController,
        private readonly layout: ChartUI
    ) {}

    setEpic(epic: string) {
        if (this.currentEpic !== epic) {
            this.saveZoom();
            this.currentEpic = epic;
        }
    }

    loadState(): ViewState | null {
        if (typeof window === 'undefined' || !this.currentEpic) return null;

        const raw = localStorage.getItem(this.getStorageKey());
        if (!raw) return null;

        try {
            const saved: EnhancedViewState = JSON.parse(raw);

            if (saved.lastDataTimeAtSave) {
                const ageSeconds = (Date.now() / 1000) - saved.lastDataTimeAtSave;
                if (ageSeconds > STALE_VIEW_THRESHOLD_S) {
                    log.info(`[ChartStateManager] Saved view stale (${Math.round(ageSeconds / 3600)}h old), resetting`);
                    localStorage.removeItem(this.getStorageKey());
                    return null;
                }
            }

            return saved;
        } catch {
            return null;
        }
    }

    reset() {
        const lastCandle = marketStore.lastCandle?.time as number | undefined;
        if (lastCandle) {
            this.controller.camera.resetZoom(lastCandle);
        }
        localStorage.removeItem(this.getStorageKey());
    }

    destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.saveZoomWrapper);
        }
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
    }

    initListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.saveZoomWrapper);
        }
        this.controller.subscribeCameraChange(() => this.scheduleSaveZoom());
    }

    private getStorageKey(): string {
        return `${STORAGE.CHART_STATE_KEY}_${this.currentEpic}`;
    }

    private scheduleSaveZoom() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveZoom(), 500);
    }

    private saveZoomWrapper = () => this.saveZoom();

    private saveZoom() {
        if (typeof window === 'undefined' || !this.currentEpic) return;

        if (!marketStore.isLoaded) return;

        const state = this.controller.camera.getViewState();
        const lastCandle = marketStore.lastCandle;

        if (state && lastCandle) {
            const enhanced: EnhancedViewState = {
                ...state,
                lastDataTimeAtSave: Number(lastCandle.time)
            };
            localStorage.setItem(this.getStorageKey(), JSON.stringify(enhanced));
        }
    }
}
