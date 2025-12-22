import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA, isIOS } from "$lib/utils/platform.js";

export class ViewportService {
    width = $state(0);
    height = $state(0);

    // The "Max" dimensions seen (persisted), used to defeat the dynamic URL bar on iOS
    maxWidth = $state(0);
    maxHeight = $state(0);

    constructor() {
        if (typeof window !== 'undefined') {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.loadCache();
        }
    }

    private loadCache() {
        this.maxWidth = parseFloat(localStorage.getItem(STORAGE.MAX_LONG_KEY) || '0');
        this.maxHeight = parseFloat(localStorage.getItem(STORAGE.MAX_SHORT_KEY) || '0');
    }

    init() {
        if (typeof window === 'undefined') return;

        this.scan();

        window.addEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
        window.visualViewport?.addEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
    }

    destroy() {
        if (typeof window === 'undefined') return;

        window.removeEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.removeEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
        window.visualViewport?.removeEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
    }

    resetCache() {
        if (typeof window === 'undefined') return;

        localStorage.removeItem(STORAGE.MAX_LONG_KEY);
        localStorage.removeItem(STORAGE.MAX_SHORT_KEY);

        this.maxWidth = 0;
        this.maxHeight = 0;

        // Force a rescan of current clean state
        this.scan();
    }

    private handleResize = () => {
        this.scan();
    }

    private scan() {
        // 1. Always update current dimensions so the app is reactive on all platforms
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // 2. Only run the "Max Cache" logic on iOS PWA
        // We exclude Android PWA (which handles resize nicely) and Desktop
        if (!isPWA() || !isIOS()) return;

        const sources = [
            { w: screen.width, h: screen.height },
            { w: window.innerWidth, h: window.innerHeight } // Also consider window for max capture
        ];

        let changed = false;

        sources.forEach(s => {
            if (!s.w || !s.h) return;
            const long = Math.max(s.w, s.h);
            const short = Math.min(s.w, s.h);

            // Logic: We want to capture the LARGEST dimension seen (hiding the address bar)
            if (long > this.maxWidth && long < TOO_MANY_PIXELS) {
                this.maxWidth = long;
                changed = true;
            }
            if (short > this.maxHeight && short < TOO_MANY_PIXELS) {
                this.maxHeight = short;
                changed = true;
            }
        });

        if (changed) {
            localStorage.setItem(STORAGE.MAX_LONG_KEY, this.maxWidth.toString());
            localStorage.setItem(STORAGE.MAX_SHORT_KEY, this.maxHeight.toString());
        }
    }

    /**
     * Returns the 'best' dimensions for the chart container.
     * On iOS PWA, this uses the cached 'max' values to prevent jumping when the URL bar collapses.
     * On Desktop/Android/Browser, it matches the window.
     */
    getChartDimensions() {
        // Strict Safety: If not iOS PWA, ignore cache completely.
        // This fixes the "Localhost breaks" issue if you have old junk in localStorage.
        if (!isPWA() || !isIOS()) {
            return { width: this.width, height: this.height };
        }

        const isLandscape = this.width > this.height;

        // Simple fallback if no max data yet
        if (this.maxWidth === 0 || this.maxHeight === 0) {
            return { width: this.width, height: this.height };
        }

        return {
            width: isLandscape ? this.maxWidth : this.maxHeight,
            height: isLandscape ? this.maxHeight : this.maxWidth
        };
    }
}

export const viewport = new ViewportService();