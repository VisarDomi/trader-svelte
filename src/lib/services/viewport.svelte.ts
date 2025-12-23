import * as STORAGE from "$lib/constants/storage.js";
import * as EVENTS from "$lib/constants/events.js";
import { TOO_MANY_PIXELS } from "$lib/constants/viewport.js";
import { isPWA, isIOS } from "$lib/utils/platform.js";

export class ViewportService {
    width = $state(0);
    height = $state(0);

    maxWidth = $state(0);
    maxHeight = $state(0);

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

        this.isPwa = isPWA();
        this.isIos = isIOS();

        this.scan();

        window.addEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
    }

    destroy() {
        if (typeof window === 'undefined') return;
        window.removeEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.removeEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
    }

    resetCache() {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(STORAGE.MAX_LONG_KEY);
        localStorage.removeItem(STORAGE.MAX_SHORT_KEY);
        this.maxWidth = 0;
        this.maxHeight = 0;
        this.scan();
    }

    scan = () => {
        this.isPwa = isPWA();

        if (!this.isIos) {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            return;
        }

        const sW = screen.width;
        const sH = screen.height;

        if (!sW || !sH) return;

        const currentLong = Math.max(sW, sH);
        const currentShort = Math.min(sW, sH);
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

        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        const long = this.maxWidth > 0 ? this.maxWidth : currentLong;
        const short = this.maxHeight > 0 ? this.maxHeight : currentShort;

        this.width = isLandscape ? long : short;
        this.height = isLandscape ? short : long;
    }

    private handleResize = () => {
        this.scan();
    }
}

export const viewport = new ViewportService();