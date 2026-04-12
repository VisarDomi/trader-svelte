import * as STORAGE from '$lib/shared/constants/storage.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { DEFAULT_ERROR } from '$lib/shared/constants/error.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import type { SessionTokens, UserCredentials } from '$lib/shared/types/auth.js';

interface SessionCache {
    timestamp: number;
    tokens: {
        [key in URL_TYPE]?: SessionTokens;
    };
}

interface AppState {
    mode: URL_TYPE;
    lastEpic: string;
    accountIds: {
        [key in URL_TYPE]?: string;
    };
}

interface TradeContext {
    dealId: string;
    initialBalance: number;
}

export class SessionManager {

    constructor() {
        if (typeof window !== 'undefined') {
            this.cleanupLegacy();
        }
    }

    private cleanupLegacy() {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key) continue;

            if (key.startsWith('IB_')) {
                localStorage.removeItem(key);
            }

            if (['TOKENS_REAL', 'TOKENS_DEMO', 'TRADING_MODE', 'LAST_EPIC', 'MAX_LONG', 'MAX_SHORT'].includes(key)) {
                localStorage.removeItem(key);
            }
        }
    }

    private getJSON<T>(key: string): T | null {
        if (typeof window === 'undefined') return null;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    private setJSON(key: string, data: any) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(data));
    }

    getCredentials(): UserCredentials {
        const c = this.getJSON<UserCredentials>(STORAGE.CREDENTIALS_KEY);
        if (c?.apiKey && c?.password && c?.identifier) {
            return c;
        }
        throw new Error(DEFAULT_ERROR);
    }

    saveCredentials(c: UserCredentials) {
        this.setJSON(STORAGE.CREDENTIALS_KEY, c);
    }

    private getSessionCache(): SessionCache {
        return this.getJSON<SessionCache>(STORAGE.SESSION_KEY) || { timestamp: 0, tokens: {} };
    }

    getTokens(type: URL_TYPE): SessionTokens | null {
        return this.getSessionCache().tokens[type] || null;
    }

    getTimestamp(): number {
        return this.getSessionCache().timestamp;
    }

    saveTokens(type: URL_TYPE, tokens: SessionTokens) {
        const cache = this.getSessionCache();
        cache.tokens[type] = tokens;
        this.setJSON(STORAGE.SESSION_KEY, cache);
    }

    saveLoginTimestamp() {
        const cache = this.getSessionCache();
        cache.timestamp = Date.now();
        this.setJSON(STORAGE.SESSION_KEY, cache);
    }

    isAuthenticated(type?: URL_TYPE): boolean {
        return this.getTokens(type || this.mode) !== null;
    }

    private getState(): AppState {
        return this.getJSON<AppState>(STORAGE.STATE_KEY) || {
            mode: AUTH.DEMO_TYPE,
            lastEpic: TRADING.NDX_EPIC,
            accountIds: {}
        };
    }

    get mode(): URL_TYPE {
        return this.getState().mode;
    }

    set mode(value: URL_TYPE) {
        const s = this.getState();
        s.mode = value;
        this.setJSON(STORAGE.STATE_KEY, s);
    }

    get lastEpic(): string {
        return this.getState().lastEpic;
    }

    set lastEpic(value: string) {
        const s = this.getState();
        s.lastEpic = value;
        this.setJSON(STORAGE.STATE_KEY, s);
    }

    getLastAccountId(type: URL_TYPE): string | null {
        return this.getState().accountIds[type] || null;
    }

    setLastAccountId(type: URL_TYPE, accountId: string) {
        const s = this.getState();
        s.accountIds[type] = accountId;
        this.setJSON(STORAGE.STATE_KEY, s);
    }

    getInitialBalance(dealId: string): number | null {
        const ctx = this.getJSON<TradeContext>(STORAGE.TRADE_CONTEXT_KEY);
        if (ctx && ctx.dealId === dealId) {
            return ctx.initialBalance;
        }
        return null;
    }

    setInitialBalance(dealId: string, amount: number) {
        this.setJSON(STORAGE.TRADE_CONTEXT_KEY, { dealId, initialBalance: amount });
    }

    removeInitialBalance(dealId: string) {
        const ctx = this.getJSON<TradeContext>(STORAGE.TRADE_CONTEXT_KEY);
        if (ctx && ctx.dealId === dealId) {
            localStorage.removeItem(STORAGE.TRADE_CONTEXT_KEY);
        }
    }

    clearAppSession() {
        if (typeof window === 'undefined') return;

        localStorage.removeItem(STORAGE.CREDENTIALS_KEY);
        localStorage.removeItem(STORAGE.SESSION_KEY);
        localStorage.removeItem(STORAGE.STATE_KEY);
        localStorage.removeItem(STORAGE.TRADE_CONTEXT_KEY);
        localStorage.removeItem(STORAGE.CHART_STATE_KEY);
    }
}

export const session = new SessionManager();
