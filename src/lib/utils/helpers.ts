import type {URL_TYPE} from "$lib/types/url.js";
import {DEFAULT_ERROR} from "$lib/constants/error.js";
import {MAX_LONG_KEY, MAX_SHORT_KEY} from "$lib/constants/storage.js";
import {DEMO_TYPE, REAL_TYPE} from "$lib/constants/auth.js";
import {DEMO_BASE_URL, REAL_BASE_URL} from "$lib/constants/api.js";

export function removeTradingViewLogo() {
    const delay = 100;
    const maxAttempts = 20;
    let attempts = 0;
    const tryToRemove = () => {
        attempts++;
        const logo = document.querySelector('a[href*="tradingview"]');
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
    const storedLong = localStorage.getItem(MAX_LONG_KEY);
    const storedShort = localStorage.getItem(MAX_SHORT_KEY);
    if (!storedLong || !storedShort) {
        return { width: winW, height: winH };
    }
    const maxLong = parseFloat(storedLong);
    const maxShort = parseFloat(storedShort);
    const isLandscape = winW > winH;
    return {
        width: isLandscape ? maxLong : maxShort,
        height: isLandscape ? maxShort : maxLong
    };
}

export function getBaseUrl(type: URL_TYPE): string {
    switch (type) {
        case DEMO_TYPE:
            return DEMO_BASE_URL;
        case REAL_TYPE:
            return REAL_BASE_URL;
        default:
            throw new Error(DEFAULT_ERROR);
    }
}
