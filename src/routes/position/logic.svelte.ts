import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import type { Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class PositionViewerLogic {
    activeType = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    isLoading = $state(true);
    isClosing = $state(false);
    error = $state('');
    message = $state('');

    currentAccount = $state<Account | null>(null);
    currentPosition = $state<PositionResponse | null>(null);
    targetEpic = $state('');

    async init() {
        if (typeof window === 'undefined') return;

        // 1. Determine Mode
        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.activeType = storedMode || AUTH.DEMO_TYPE;

        // 2. Determine Epic (Default to last used)
        const storedEpic = localStorage.getItem(STORAGE.LAST_EPIC_KEY);
        this.targetEpic = storedEpic || TRADING.NDX_EPIC;

        await this.load();
    }

    private getTokens(type: URL_TYPE): SessionTokens | null {
        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);
        if (!tokensStr) return null;
        return JSON.parse(tokensStr);
    }

    async load() {
        this.isLoading = true;
        this.error = '';
        this.currentAccount = null;
        this.currentPosition = null;

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            await goto('/login');
            return;
        }

        try {
            const [accounts, positionsData] = await Promise.all([
                getSyncedAccounts(this.activeType, tokens),
                getPositions(this.activeType, tokens)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;

            // Find position for current EPIC
            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);
            this.currentPosition = found || null;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    async closePosition() {
        if (!this.currentPosition) return;

        this.isClosing = true;
        this.error = '';

        const currentDir = this.currentPosition.position.direction;
        const oppositeDir = currentDir === TRADING.BUY_DIRECTION ? TRADING.SELL_DIRECTION : TRADING.BUY_DIRECTION;
        const size = this.currentPosition.position.size;

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            this.error = "Session expired";
            this.isClosing = false;
            return;
        }

        try {
            await createPosition(this.activeType, tokens, {
                epic: this.targetEpic,
                direction: oppositeDir,
                size
            });

            this.message = "Position closed successfully";
            await goto('/chart');

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            this.isClosing = false;
        }
    }
}