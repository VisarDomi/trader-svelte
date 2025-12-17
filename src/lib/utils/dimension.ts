import * as STORAGE from '../constants/storage.js';
import * as EVENT from '../constants/events.js';
import * as VIEWPORT from '../constants/viewport.js';

function scanDimensions() {
    const sources = [
        { name: 'window.inner', w: window.innerWidth, h: window.innerHeight },
        { name: 'window.outer', w: window.outerWidth, h: window.outerHeight },
        { name: 'screen', w: screen.width, h: screen.height },
        { name: 'screen.avail', w: screen.availWidth, h: screen.availHeight },
        { name: 'visualViewport', w: window.visualViewport?.width || 0, h: window.visualViewport?.height || 0 }
    ];

    let savedLong = parseFloat(localStorage.getItem(STORAGE.MAX_LONG_KEY) || '0');
    let savedShort = parseFloat(localStorage.getItem(STORAGE.MAX_SHORT_KEY) || '0');

    sources.forEach(s => {
        if (!s.w || !s.h) return;

        const long = Math.max(s.w, s.h);
        const short = Math.min(s.w, s.h);

        if (long > savedLong && long < VIEWPORT.TOO_MANY_PIXELS) savedLong = long;
        if (short > savedShort && short < VIEWPORT.TOO_MANY_PIXELS) savedShort = short;
    });

    localStorage.setItem(STORAGE.MAX_LONG_KEY, savedLong.toString());
    localStorage.setItem(STORAGE.MAX_SHORT_KEY, savedShort.toString());
}

export function viewportScanner() {
    if (typeof window === 'undefined') return () => {};

    // Run immediately
    scanDimensions();

    // Attach listeners
    window.addEventListener(EVENT.WINDOW_RESIZE, scanDimensions);
    window.addEventListener(EVENT.WINDOW_ORIENTATION_CHANGE, scanDimensions);
    window.visualViewport?.addEventListener(EVENT.WINDOW_RESIZE, scanDimensions);

    // Return Cleanup Function
    return () => {
        window.removeEventListener(EVENT.WINDOW_RESIZE, scanDimensions);
        window.removeEventListener(EVENT.WINDOW_ORIENTATION_CHANGE, scanDimensions);
        window.visualViewport?.removeEventListener(EVENT.WINDOW_RESIZE, scanDimensions);
    };
}