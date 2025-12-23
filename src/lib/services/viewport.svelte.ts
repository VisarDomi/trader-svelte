import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA, isIOS } from "$lib/utils/platform.js";

export class ViewportService {
    // Current window state (reactive)
    width = $state(0);
    height = $state(0);

    // Persisted Physical Dimensions (The "Truth" for iOS)
    maxWidth = $state(0);
    maxHeight = $state(0);

    // Platform Flags
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

        // Re-check flags
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
        this.isPwa = isPWA();

        // Capture Physical Dimensions on iOS (PWA or not)
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
        // 1. Non-iOS: Standard Window
        if (!this.isIos) {
            return { width: this.width, height: this.height };
        }

        // 2. iOS (All Modes): Physical Screen
        const isLandscape = this.width > this.height;

        // Fallback to raw screen if cache is empty
        const long = this.maxWidth > 0 ? this.maxWidth : Math.max(screen.width, screen.height);
        const short = this.maxHeight > 0 ? this.maxHeight : Math.min(screen.width, screen.height);

        return {
            width: isLandscape ? long : short,
            height: isLandscape ? short : long
        };
    }
}

export const viewport = new ViewportService();