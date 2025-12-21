import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import { getMarketDetails } from '$lib/services/market.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import type { Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { PositionResponse } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

export class PositionViewerLogic {
    activeType = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    isLoading = $state(true);
    isClosing = $state(false);
    error = $state('');
    message = $state('');

    currentAccount = $state<Account | null>(null);
    currentPosition = $state<PositionResponse | null>(null);
    marketDetails = $state<MarketDetailsResponse | null>(null);
    targetEpic = $state('');

    // Default precision if market details fail
    precision = $state(2);

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
        this.marketDetails = null;

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            await goto('/login');
            return;
        }

        try {
            // Fetch Accounts, All Positions, and Specific Market Details (for precision)
            const [accounts, positionsData, marketData] = await Promise.all([
                getSyncedAccounts(this.activeType, tokens),
                getPositions(this.activeType, tokens),
                getMarketDetails(this.activeType, tokens, this.targetEpic).catch(() => null)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;
            this.marketDetails = marketData;

            if (this.marketDetails) {
                this.precision = this.marketDetails.snapshot.decimalPlacesFactor;
            }

            // Find position for current EPIC
            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);

            // SIMULATE GRAPH LOGIC: Back-calculate initial balance
            if (found && this.currentAccount) {
                // NOTE: This logic mirrors src/routes/chart/+page.svelte
                // We use 'available' (Margin Available) - UPL to approximate starting state.
                const currentEquity = this.currentAccount.balance.available;
                found.position.initialBalance = currentEquity - found.position.upl;
            }

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

    // DEBUG: Replicates the line calculation logic from src/routes/chart/lines.svelte.ts
    // to visualize what the chart sees.
    get debugInfo() {
        if (!this.currentPosition) return null;

        const p = this.currentPosition.position;
        const initialBalance = p.initialBalance || 0;
        const hasValidInitialBalance = initialBalance !== 0;

        let wendy = null;
        let lambo = null;

        // WENDY (Stop Loss) Logic
        if (p.stopLevel) {
            const potentialLoss = Math.abs(p.level - p.stopLevel) * p.size;
            // Rounding logic from lines.svelte.ts
            const roundedPotentialLoss = roundDownToFactor(potentialLoss, TRADING.ACCOUNT_USD_PRICE_PRECISION);
            const pessimisticBalance = initialBalance - potentialLoss;
            const potentialLossPercentage = hasValidInitialBalance ? (potentialLoss / initialBalance) * 100 : 0;

            let offsetPercentage = 0;
            if (potentialLossPercentage < 100) {
                offsetPercentage = (potentialLossPercentage / (100 - potentialLossPercentage)) * 100;
            }

            wendy = {
                level: p.stopLevel,
                lossVal: roundedPotentialLoss,
                balance: pessimisticBalance,
                pct: potentialLossPercentage,
                offsetPct: offsetPercentage
            };
        }

        // LAMBO (Take Profit) Logic
        if (p.profitLevel) {
            const potentialProfit = Math.abs(p.level - p.profitLevel) * p.size;
            const roundedPotentialProfit = roundDownToFactor(potentialProfit, TRADING.ACCOUNT_USD_PRICE_PRECISION);
            const optimisticBalance = initialBalance + potentialProfit;
            const potentialProfitPercentage = hasValidInitialBalance ? (potentialProfit / initialBalance) * 100 : 0;

            const offsetPercentage = (potentialProfitPercentage / (100 + potentialProfitPercentage)) * 100;

            lambo = {
                level: p.profitLevel,
                profitVal: roundedPotentialProfit,
                balance: optimisticBalance,
                pct: potentialProfitPercentage,
                offsetPct: offsetPercentage
            };
        }

        return {
            initialBalance,
            entry: p.level,
            size: p.size,
            upl: p.upl,
            wendy,
            lambo
        };
    }
}