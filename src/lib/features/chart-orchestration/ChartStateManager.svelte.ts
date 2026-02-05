import * as STORAGE from '$lib/shared/constants/storage.js';
import type { ChartController, ViewState } from '$lib/components/chart-engine/ChartController.js';
import type { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';

export class ChartStateManager {
    private isZoomRestored = $state(false);
    private currentEpic = $state("");
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly controller: ChartController,
        private readonly layout: ChartUI
    ) {
        // The Latch Effect: Decouples "When" (timing) from "What" (logic)
        $effect(() => {
            const hasHistory = marketStore.history.length > 0;
            const isLayoutReady = this.layout.isDataLoaded;

            // Re-run if epic changes
            const epic = this.currentEpic;

            if (!this.isZoomRestored && hasHistory && isLayoutReady && epic) {
                // The environment is stable.
                // Attempt restore. If no save found, default to auto-scale.
                if (!this.restoreZoom()) {
                    this.controller.resetZoom();
                }

                // Lock the latch
                this.isZoomRestored = true;
            }
        });
    }

    setEpic(epic: string) {
        if (this.currentEpic !== epic) {
            this.saveZoom(); // Save old before switching
            this.currentEpic = epic;
            this.isZoomRestored = false; // Reset latch
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

    // --- Private / Internal ---

    private getStorageKey(): string {
        return `${STORAGE.CHART_STATE_KEY}_${this.currentEpic}`;
    }

    private scheduleSaveZoom() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveZoom(), 500);
    }

    // Wrapper for event listeners to bind 'this'
    private saveZoomWrapper = () => this.saveZoom();

    private saveZoom() {
        if (typeof window === 'undefined' || !this.currentEpic) return;

        // Don't save if we haven't even restored yet (prevents overwriting valid saves with default state)
        if (!this.isZoomRestored) return;

        const state = this.controller.getViewState();
        if (state) {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
        }
    }

    private restoreZoom(): boolean {
        if (typeof window === 'undefined') return false;

        const raw = localStorage.getItem(this.getStorageKey());
        if (raw) {
            try {
                const state: ViewState = JSON.parse(raw);
                // Slight delay to ensure the chart is ready to accept the range
                setTimeout(() => {
                    this.controller.restoreViewState(state);
                }, 50);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}