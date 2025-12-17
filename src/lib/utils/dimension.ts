import {MAX_LONG_KEY, MAX_SHORT_KEY} from "$lib/constants/storage";
import {TOO_MANY_PIXELS} from "$lib/constants/viewport";
import {WINDOW_ORIENTATION_CHANGE, WINDOW_RESIZE} from "$lib/constants/events";

function scanDimensions() {
    const sources = [
        { name: 'window.inner', w: window.innerWidth, h: window.innerHeight },
        { name: 'window.outer', w: window.outerWidth, h: window.outerHeight },
        { name: 'screen', w: screen.width, h: screen.height },
        { name: 'screen.avail', w: screen.availWidth, h: screen.availHeight },
        { name: 'visualViewport', w: window.visualViewport?.width || 0, h: window.visualViewport?.height || 0 }
    ];

    let savedLong = parseFloat(localStorage.getItem(MAX_LONG_KEY) || '0');
    let savedShort = parseFloat(localStorage.getItem(MAX_SHORT_KEY) || '0');

    sources.forEach(s => {
        if (!s.w || !s.h) return;

        const long = Math.max(s.w, s.h);
        const short = Math.min(s.w, s.h);

        if (long > savedLong && long < TOO_MANY_PIXELS) savedLong = long;
        if (short > savedShort && short < TOO_MANY_PIXELS) savedShort = short;
    });

    localStorage.setItem(MAX_LONG_KEY, savedLong.toString());
    localStorage.setItem(MAX_SHORT_KEY, savedShort.toString());
}

export function viewportScanner() {
    if (typeof window === 'undefined') return () => {};

    // Run immediately
    scanDimensions();

    // Attach listeners
    window.addEventListener(WINDOW_RESIZE, scanDimensions);
    window.addEventListener(WINDOW_ORIENTATION_CHANGE, scanDimensions);
    window.visualViewport?.addEventListener(WINDOW_RESIZE, scanDimensions);

    // Return Cleanup Function
    return () => {
        window.removeEventListener(WINDOW_RESIZE, scanDimensions);
        window.removeEventListener(WINDOW_ORIENTATION_CHANGE, scanDimensions);
        window.visualViewport?.removeEventListener(WINDOW_RESIZE, scanDimensions);
    };
}
