import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA, isIOS } from "$lib/utils/platform.js";

export class ViewportService {
    width = $state(0);
    height = $state(0);

    // Persisted Max Dimensions
    maxWidth = $state(0);
    maxHeight = $state(0);

    // Platform Flags (exposed for debugging)
    isPwa = $state(false);
    isIos = $state(false);

    constructor() {
        if (typeof window !== 'undefined') {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.isPwa = isPWA();
            this.isIos = isIOS();
            this.loadCache();
        }
    }

    private loadCache() {
        this.maxWidth = parseFloat(localStorage.getItem(STORAGE.MAX_LONG_KEY) || '0');
        this.maxHeight = parseFloat(localStorage.getItem(STORAGE.MAX_SHORT_KEY) || '0');
    }

    init() {
        if (typeof window === 'undefined') return;

        // Re-check platform flags on init to be sure
        this.isPwa = isPWA();
        this.isIos = isIOS();

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

        this.scan();
    }

    private handleResize = () => {
        this.scan();
    }

    private scan() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Update flags dynamically in case they change (e.g. adding to home screen while running?)
        this.isPwa = isPWA();

        // 1. Capture Max Dimensions logic
        // We removed the isPWA() check here. We want to capture screen geometry
        // whenever we are on iOS, so the data is ready if we need it.
        if (!this.isIos) return;

        const sources = [
            { w: screen.width, h: screen.height },
            { w: window.innerWidth, h: window.innerHeight }
        ];

        let changed = false;

        sources.forEach(s => {
            if (!s.w || !s.h) return;
            const long = Math.max(s.w, s.h);
            const short = Math.min(s.w, s.h);

            // Capture the LARGEST dimension seen (hiding the address bar / full screen)
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

    getChartDimensions() {
        // Strict Safety: Only use the Cached Max dimensions if we are actually
        // in the iOS PWA environment. Everywhere else, use standard window size.
        if (!this.isPwa || !this.isIos) {
            return { width: this.width, height: this.height };
        }

        const isLandscape = this.width > this.height;

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