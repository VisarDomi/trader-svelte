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

    precision = $state(2);
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    async init() {
        if (typeof window === 'undefined') return;

        // 1. Determine Mode & Epic
        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.activeType = storedMode || AUTH.DEMO_TYPE;

        const storedEpic = localStorage.getItem(STORAGE.LAST_EPIC_KEY);
        this.targetEpic = storedEpic || TRADING.NDX_EPIC;

        // 2. Initial Load
        await this.load();

        // 3. Start Polling for Real-Time Debugging
        this.startPolling();
    }

    destroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    private startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(async () => {
            // Quiet load (don't set isLoading)
            await this.load(true);
        }, 1000);
    }

    private getTokens(type: URL_TYPE): SessionTokens | null {
        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);
        if (!tokensStr) return null;
        return JSON.parse(tokensStr);
    }

    async load(isPolling = false) {
        if (!isPolling) this.isLoading = true;
        this.error = '';

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            if (!isPolling) await goto('/login');
            return;
        }

        try {
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

            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);

            if (found && this.currentAccount) {
                // BUG FIX:
                // Previous incorrect logic: currentEquity (Free Margin) - upl = Negative result
                // Correct logic: initialBalance = account.balance.balance (Cash Balance)
                // This represents the funds available before this trade's P&L is applied.
                found.position.initialBalance = this.currentAccount.balance.balance;
            }

            this.currentPosition = found || null;

        } catch (e) {
            // Only show error if not polling to avoid flickering UI on transient net errors
            if (!isPolling) this.error = e instanceof Error ? e.message : String(e);
        } finally {
            if (!isPolling) this.isLoading = false;
        }
    }

    async closePosition() {
        if (!this.currentPosition) return;
        this.isClosing = true;
        this.error = '';

        const size = this.currentPosition.position.size;
        const currentDir = this.currentPosition.position.direction;
        const oppositeDir = currentDir === TRADING.BUY_DIRECTION ? TRADING.SELL_DIRECTION : TRADING.BUY_DIRECTION;

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

    // DEBUG: Visualization Logic for Chart Lines
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