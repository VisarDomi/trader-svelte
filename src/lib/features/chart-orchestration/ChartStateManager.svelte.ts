import * as STORAGE from '$lib/shared/constants/storage.js';
import type { ChartController } from '$lib/components/chart-engine/ChartController.js';
import type { ViewState } from '$lib/components/chart-engine/ChartCamera.js';
import type { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';

interface EnhancedViewState extends ViewState {
    lastDataTimeAtSave: number;
}

/**
 * REFACTORED: Now a passive data access object.
 * Logic for "When to restore" has moved to the Renderer/Orchestrator to avoid race conditions.
 */
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

    /**
     * Called by the Renderer immediately after data load.
     * Returns the state if it exists, otherwise null.
     */
    loadState(): ViewState | null {
        if (typeof window === 'undefined' || !this.currentEpic) return null;

        const raw = localStorage.getItem(this.getStorageKey());
        if (!raw) return null;

        try {
            const saved: EnhancedViewState = JSON.parse(raw);
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

        // Only save if data is loaded to prevent saving an empty state during transition
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