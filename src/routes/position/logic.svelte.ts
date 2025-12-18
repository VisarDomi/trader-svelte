import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { getAccounts } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import type { Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { PositionResponse, Direction } from '$lib/types/trading.js';

export class PositionLogic {
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);
    isLoading = $state(true);
    isTrading = $state(false);
    error = $state('');
    message = $state('');

    currentAccount = $state<Account | null>(null);
    currentPosition = $state<PositionResponse | null>(null);

    // Hardcoded for now per assumptions
    targetEpic = TRADING.NDX_EPIC;
    defaultSize = 0.1;

    async init() {
        await this.load(this.activeType);
    }

    async switchType(type: URL_TYPE) {
        this.activeType = type;
        await this.load(type);
    }

    private getTokens(type: URL_TYPE): SessionTokens | null {
        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);
        if (!tokensStr) return null;
        return JSON.parse(tokensStr);
    }

    async load(type: URL_TYPE) {
        this.isLoading = true;
        this.error = '';
        this.message = '';
        this.currentAccount = null;
        this.currentPosition = null;

        const tokens = this.getTokens(type);
        if (!tokens) {
            await goto('/login');
            return;
        }

        try {
            const [accounts, positionsData] = await Promise.all([
                getAccounts(type, tokens),
                getPositions(type, tokens)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;

            // Find position for current Epic
            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);
            this.currentPosition = found || null;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    async openPosition(direction: Direction) {
        await this.executeTrade(direction, this.defaultSize);
    }

    async closePosition() {
        if (!this.currentPosition) return;

        // Simulate DELETE by POSTing opposite direction
        const currentDir = this.currentPosition.position.direction;
        const oppositeDir = currentDir === TRADING.BUY_DIRECTION ? TRADING.SELL_DIRECTION : TRADING.BUY_DIRECTION;
        const size = this.currentPosition.position.size;

        await this.executeTrade(oppositeDir, size);
    }

    private async executeTrade(direction: Direction, size: number) {
        this.isTrading = true;
        this.error = '';
        this.message = '';

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            this.error = "Session expired";
            this.isTrading = false;
            return;
        }

        try {
            await createPosition(this.activeType, tokens, {
                epic: this.targetEpic,
                direction,
                size
            });

            this.message = "Order executed successfully";
            // Refresh data to update UI to show position or clear it
            await this.load(this.activeType);

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isTrading = false;
        }
    }
}