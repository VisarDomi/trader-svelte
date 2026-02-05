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

            // Reactive check: Has zoom been restored for this epic?
            if (!this.isZoomRestored && hasHistory && isLayoutReady && epic) {

                const currentLastCandle = marketStore.lastCandle?.time as number | undefined;

                if (!this.restoreZoom(currentLastCandle)) {
                    // Fallback: Use Camera's hard reset if no saved state
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
            // Uses the new Hard Reset logic in Camera
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
        if (typeof window === 'undefined') return false;

        const raw = localStorage.getItem(this.getStorageKey());
        if (!raw) return false;

        try {
            const saved: EnhancedViewState = JSON.parse(raw);

            // Logic: "Smart Snap"
            // If the user was looking at the "Future" (Live Edge) when they saved,
            // we want to restore them to the *Current* Live Edge, not the old timestamp.
            const wasLookingAtFuture = saved.centerTime >= (saved.lastDataTimeAtSave - 60);

            let targetState: ViewState = saved;

            if (wasLookingAtFuture && currentLastCandleTime) {
                // Shift the view to align with the new Live Edge
                targetState = {
                    ...saved,
                    centerTime: currentLastCandleTime,
                };
            }

            setTimeout(() => {
                this.controller.camera.restoreViewState(targetState);
            }, 50);

            return true;
        } catch {
            return false;
        }
    }
}