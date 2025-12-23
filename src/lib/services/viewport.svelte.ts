import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA, isIOS } from "$lib/utils/platform.js";

export class ViewportService {
    // Current window state (reactive)
    width = $state(0);
    height = $state(0);

    // Persisted Physical Dimensions
    maxWidth = $state(0);
    maxHeight = $state(0);

    // Platform Flags
    isIos = $state(false);

    constructor() {
        if (typeof window !== 'undefined') {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
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

    scan = () => {
        // Internal check only - not exposed to state
        const _isPwa = isPWA();

        // 1. Non-iOS: Standard Window behavior
        if (!this.isIos) {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            return;
        }

        // 2. iOS Logic
        let rawW = 0;
        let rawH = 0;
        let isValidMeasurement = false;

        if (_isPwa) {
            // iOS PWA: Screen is truth
            rawW = screen.width;
            rawH = screen.height;
            isValidMeasurement = true;
        } else {
            // iOS Non-PWA: Window is truth, but ONLY if Zoom is ~1.0
            const scale = window.visualViewport?.scale || 1;

            if (Math.abs(scale - 1) < 0.02) {
                rawW = window.innerWidth;
                rawH = window.innerHeight;
                isValidMeasurement = true;
            }
        }

        if (isValidMeasurement && rawW && rawH) {
            const currentLong = Math.max(rawW, rawH);
            const currentShort = Math.min(rawW, rawH);
            let changed = false;

            if (currentLong > this.maxWidth && currentLong < TOO_MANY_PIXELS) {
                this.maxWidth = currentLong;
                changed = true;
            }
            if (currentShort > this.maxHeight && currentShort < TOO_MANY_PIXELS) {
                this.maxHeight = currentShort;
                changed = true;
            }

            if (changed) {
                localStorage.setItem(STORAGE.MAX_LONG_KEY, this.maxWidth.toString());
                localStorage.setItem(STORAGE.MAX_SHORT_KEY, this.maxHeight.toString());
            }
        }

        // 3. Determine Output for iOS
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;

        if (this.maxWidth > 0 && this.maxHeight > 0) {
            this.width = isLandscape ? this.maxWidth : this.maxHeight;
            this.height = isLandscape ? this.maxHeight : this.maxWidth;
        } else {
            // Fallback (First load Non-PWA or zoomed)
            this.width = window.innerWidth;
            this.height = window.innerHeight;
        }
    }
}

export const viewport = new ViewportService();