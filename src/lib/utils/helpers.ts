import * as CHART from '$lib/constants/chart.js';
import * as STORAGE from "$lib/constants/storage.js";

export function removeTradingViewLogo() {
    const delay = 100;
    const maxAttempts = 20;
    let attempts = 0;

    const tryToRemove = () => {
        attempts++;
        const logo = document.getElementById(CHART.CHART_CONTAINER_ID)?.querySelector('a[href*="tradingview"]');
        if (logo && logo.parentNode) {
            logo.parentNode.removeChild(logo);
            return;
        }
        if (attempts < maxAttempts) {
            setTimeout(tryToRemove, delay);
        }
    };
    setTimeout(tryToRemove, delay);
}

export function getStoredDimensions() {
    // Fallback to window for initial render or if scanner hasn't run (like in Tests)
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const storedLong = localStorage.getItem(STORAGE.MAX_LONG_KEY);
    const storedShort = localStorage.getItem(STORAGE.MAX_SHORT_KEY);

    if (!storedLong || !storedShort) {
        return { width: winW, height: winH };
    }

    const maxLong = parseFloat(storedLong);
    const maxShort = parseFloat(storedShort);

    // Determine orientation based on current window state
    const isLandscape = winW > winH;

    return {
        width: isLandscape ? maxLong : maxShort,
        height: isLandscape ? maxShort : maxLong
    };
}