import * as STORAGE from "$lib/shared/constants/storage.js";
import * as EVENTS from "$lib/shared/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/shared/constants/viewport.js";
import { isPWA, isIOS } from "$lib/core/utils/platform.js";

interface ViewportCache {
    long: number;
    short: number;
}

export class ViewportService {
    width = $state(0);
    height = $state(0);

    maxWidth = $state(0);
    maxHeight = $state(0);

    isIos = $state(false);

    private frameId: number | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.isIos = isIOS();
            this.loadCache();
        }
    }

    private loadCache() {
        const raw = localStorage.getItem(STORAGE.VIEWPORT_KEY);
        if (raw) {
            try {
                const cache: ViewportCache = JSON.parse(raw);
                this.maxWidth = cache.long;
                this.maxHeight = cache.short;
            } catch {

            }
        }
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

        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
    }

    private handleResize = () => {
        if (this.frameId) return;

        this.frameId = requestAnimationFrame(() => {
            this.scan();
            this.frameId = null;
        });
    }

    scan = () => {
        const _isPwa = isPWA();

        if (!this.isIos) {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            return;
        }

        let rawW = 0;
        let rawH = 0;
        let isValidMeasurement = false;

        if (_isPwa) {
            rawW = screen.width;
            rawH = screen.height;
            isValidMeasurement = true;
        } else {
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
                const cache: ViewportCache = { long: this.maxWidth, short: this.maxHeight };
                localStorage.setItem(STORAGE.VIEWPORT_KEY, JSON.stringify(cache));
            }
        }

        const isLandscape = window.matchMedia('(orientation: landscape)').matches;

        if (this.maxWidth > 0 && this.maxHeight > 0) {
            this.width = isLandscape ? this.maxWidth : this.maxHeight;
            this.height = isLandscape ? this.maxHeight : this.maxWidth;
        } else {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
        }
    }
}

export const viewport = new ViewportService();
