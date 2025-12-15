import * as CHART from '$lib/constants/chart.js';
import * as STORAGE from "$lib/constants/storage.js";
import * as AUTH from '$lib/constants/auth.js';
import * as API from '$lib/constants/api.js';
import type {URL_TYPE} from "$lib/types/url";

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

export function getBaseUrl(type: URL_TYPE): string {
    switch (type) {
        case AUTH.DEMO_TYPE:
            return API.DEMO_BASE_URL;
        case AUTH.REAL_TYPE:
            return API.REAL_BASE_URL;
        default:
            throw new Error(`Unsupported account type: ${type}`);
    }
}
