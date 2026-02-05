import * as STORAGE from '$lib/shared/constants/storage.js';
import type { ChartController, ViewState } from '$lib/components/chart-engine/ChartController.js';
import type { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';

// Extend ViewState to include context about the data at the time of saving
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

            // Re-run if epic changes
            const epic = this.currentEpic;

            if (!this.isZoomRestored && hasHistory && isLayoutReady && epic) {
                // Determine the CURRENT live time for calculation
                const currentLastCandle = marketStore.lastCandle?.time as number | undefined;

                if (!this.restoreZoom(currentLastCandle)) {
                    this.controller.resetZoom();
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
        this.controller.resetZoom();
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

    // --- Internal ---

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

        const state = this.controller.getViewState();
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
        if (typeof window === 'undefined') return false;

        const raw = localStorage.getItem(this.getStorageKey());
        if (!raw) return false;

        try {
            const saved: EnhancedViewState = JSON.parse(raw);

            // LOGIC: The "Smart Snap" Pattern
            // If the user's center view was >= the last known data time,
            // they were looking at the "Future" or "Live Edge".
            const wasLookingAtFuture = saved.centerTime >= saved.lastDataTimeAtSave;

            let targetState: ViewState = saved;

            // If they were looking at the future, shift the view to the NEW Present
            // but keep their Zoom Level (timeSpan)
            if (wasLookingAtFuture && currentLastCandleTime) {
                targetState = {
                    ...saved,
                    centerTime: currentLastCandleTime,
                    // We effectively slide the window to center on the new data
                    // while preserving price scale and zoom level
                };
            }

            setTimeout(() => {
                this.controller.restoreViewState(targetState);
            }, 50);

            return true;
        } catch {
            return false;
        }
    }
}