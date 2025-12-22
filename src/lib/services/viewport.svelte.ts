import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA } from "$lib/utils/platform.js";

class ViewportService {
    width = $state(0);
    height = $state(0);

    // The "Max" dimensions seen (persisted), used to defeat the dynamic URL bar on iOS
    maxWidth = $state(0);
    maxHeight = $state(0);

    constructor() {
        if (typeof window !== 'undefined') {
            this.width = window.innerWidth;
            this.height = window.innerHeight;

            this.maxWidth = parseFloat(localStorage.getItem(STORAGE.MAX_LONG_KEY) || '0');
            this.maxHeight = parseFloat(localStorage.getItem(STORAGE.MAX_SHORT_KEY) || '0');
        }
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

    private handleResize = () => {
        this.scan();
    }

    private scan() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // If NOT in PWA mode, we do NOT use the caching logic.
        // We simply trust the browser's reported dimensions.
        if (!isPWA()) return;

        const sources = [
            { w: window.innerWidth, h: window.innerHeight },
            { w: window.outerWidth, h: window.outerHeight },
            { w: screen.width, h: screen.height },
            { w: screen.availWidth, h: screen.availHeight },
            { w: window.visualViewport?.width || 0, h: window.visualViewport?.height || 0 }
        ];

        let changed = false;

        sources.forEach(s => {
            if (!s.w || !s.h) return;
            const long = Math.max(s.w, s.h);
            const short = Math.min(s.w, s.h);

            // Logic: We want to capture the LARGEST dimension seen (hiding the address bar)
            // But we ignore absurdly large values (desktop monitors if debugging, or bugs)
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
        // Non-PWA Mode: Always return current window dimensions
        if (!isPWA()) {
            return { width: this.width, height: this.height };
        }

        // PWA Mode: Use cached max logic
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

export const viewport = new ViewportService(); //broken state