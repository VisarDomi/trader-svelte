import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { SessionTokens } from '$lib/types/auth.js';
import { ApiClient } from '$lib/api/client.js';

class SessionManager {
    /**
     * READS
     */

    // Get the current active trading mode (REAL vs DEMO)
    get mode(): URL_TYPE {
        if (typeof window === 'undefined') return AUTH.DEMO_TYPE;
        return (localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE) || AUTH.DEMO_TYPE;
    }

    // Get the last selected Epic
    get lastEpic(): string {
        if (typeof window === 'undefined') return TRADING.NDX_EPIC;
        return localStorage.getItem(STORAGE.LAST_EPIC_KEY) || TRADING.NDX_EPIC;
    }

    // Get raw tokens for a specific environment
    getTokens(type: URL_TYPE): SessionTokens | null {
        if (typeof window === 'undefined') return null;
        const key = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    // Factory: Get a ready-to-use API Client for the requested type (or default to active mode)
    getClient(type?: URL_TYPE): ApiClient | null {
        const targetType = type || this.mode;
        const tokens = this.getTokens(targetType);
        if (!tokens) return null;
        return new ApiClient(targetType, tokens);
    }

    // Check if we have valid tokens for the current mode
    isAuthenticated(type?: URL_TYPE): boolean {
        return this.getTokens(type || this.mode) !== null;
    }

    /**
     * WRITES
     */

    set mode(value: URL_TYPE) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE.TRADING_MODE_KEY, value);
    }

    set lastEpic(value: string) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE.LAST_EPIC_KEY, value);
    }

    saveTokens(type: URL_TYPE, tokens: SessionTokens) {
        if (typeof window === 'undefined') return;
        const key = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        localStorage.setItem(key, JSON.stringify(tokens));
    }

    saveLoginTimestamp() {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE.LOGIN_TIMESTAMP_KEY, Date.now().toString());
    }

    // Persist which account ID was last used for a specific environment (for auto-switch)
    setLastAccountId(type: URL_TYPE, accountId: string) {
        if (typeof window === 'undefined') return;
        const key = type === AUTH.REAL_TYPE ? STORAGE.LAST_REAL_ACCOUNT_ID_KEY : STORAGE.LAST_DEMO_ACCOUNT_ID_KEY;
        localStorage.setItem(key, accountId);
    }

    getLastAccountId(type: URL_TYPE): string | null {
        if (typeof window === 'undefined') return null;
        const key = type === AUTH.REAL_TYPE ? STORAGE.LAST_REAL_ACCOUNT_ID_KEY : STORAGE.LAST_DEMO_ACCOUNT_ID_KEY;
        return localStorage.getItem(key);
    }

    // Initial Balance Logic (Local Storage specific)
    getInitialBalance(dealId: string): number | null {
        if (typeof window === 'undefined') return null;
        const val = localStorage.getItem(`IB_${dealId}`);
        return val ? parseFloat(val) : null;
    }

    setInitialBalance(dealId: string, amount: number) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(`IB_${dealId}`, amount.toString());
    }

    removeInitialBalance(dealId: string) {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(`IB_${dealId}`);
    }
}

export const session = new SessionManager();