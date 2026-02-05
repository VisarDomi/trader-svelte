import * as STORAGE from '$lib/shared/constants/storage.js';
import type { ChartController } from '$lib/components/chart-engine/ChartController.js';
import type { ViewState } from '$lib/components/chart-engine/ChartCamera.js';
import type { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';

interface EnhancedViewState extends ViewState {
    lastDataTimeAtSave: number;
}

export class ChartStateManager {
    private isZoomRestored = $state(false);
    private currentEpic = $state("");
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly controller: ChartController,
        private readonly layout: ChartUI
    ) {
        $effect(() => {
            const hasHistory = marketStore.history.length > 0;
            const isLayoutReady = this.layout.isDataLoaded;
            const epic = this.currentEpic;

            // Wait for data and layout before attempting restore
            if (!this.isZoomRestored && hasHistory && isLayoutReady && epic) {

                const currentLastCandle = marketStore.lastCandle?.time as number | undefined;

                if (!this.restoreZoom(currentLastCandle)) {
                    // Fallback: If no saved state, hard reset to a sane default
                    if (currentLastCandle) {
                        this.controller.camera.resetZoom(currentLastCandle);
                    }
                }

                this.isZoomRestored = true;
            }
        });
    }

    setEpic(epic: string) {
        if (this.currentEpic !== epic) {
            this.saveZoom();
            this.currentEpic = epic;
            this.isZoomRestored = false;
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
        if (!this.isZoomRestored) return;

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

    private restoreZoom(currentLastCandleTime?: number): boolean {
        if (typeof window === 'undefined' || !currentLastCandleTime) return false;

        const raw = localStorage.getItem(this.getStorageKey());
        if (!raw) return false;

        try {
            const saved: EnhancedViewState = JSON.parse(raw);

            // REFACTORED: Delegate the decision making to the Camera
            // We pass the saved state AND the current reality (currentLastCandleTime)
            // The Camera decides if it should snap to live or stay in history.
            setTimeout(() => {
                this.controller.camera.restoreState(saved, currentLastCandleTime);
            }, 50);

            return true;
        } catch {
            return false;
        }
    }
}