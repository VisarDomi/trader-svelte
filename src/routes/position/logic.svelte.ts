import { goto } from '$app/navigation';
import { DateTime } from 'luxon';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import { getMarketDetails } from '$lib/services/market.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import { formatTimestampToLocalTime } from '$lib/utils/time.js';
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

        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.activeType = storedMode || AUTH.DEMO_TYPE;

        const storedEpic = localStorage.getItem(STORAGE.LAST_EPIC_KEY);
        this.targetEpic = storedEpic || TRADING.NDX_EPIC;

        await this.load();
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
                // Correctly set initial balance based on cash balance (ignores floating P&L)
                found.position.initialBalance = this.currentAccount.balance.balance;
            }

            this.currentPosition = found || null;

        } catch (e) {
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

    // DEBUG: Visualization Logic for Chart Lines (Matches Old Repo ChartService.ts & lines.ts)
    get debugInfo() {
        if (!this.currentPosition) return null;

        const p = this.currentPosition.position;
        const initialBalance = p.initialBalance || 0;
        const hasValidInitialBalance = initialBalance !== 0;

        // --- 1. STARTING LINE LOGIC ---
        const directionText = p.direction === "BUY" ? "You bought" : "You sold";
        let startingTitle = `${directionText} ${p.size} ${this.currentPosition.market.epic}`;
        if (p.createdDateUTC) {
            const dateSeconds = DateTime.fromISO(p.createdDateUTC, { zone: "utc" }).toSeconds();
            const tradeTime = formatTimestampToLocalTime(dateSeconds as any);
            startingTitle += ` at ${tradeTime}`;
        }
        const starting = {
            level: p.level,
            title: startingTitle
        };

        // --- 2. WENDY (SL) LOGIC ---
        let wendy = null;
        if (p.stopLevel) {
            const potentialLoss = Math.abs(p.level - p.stopLevel) * p.size;
            const roundedPotentialLoss = roundDownToFactor(potentialLoss, TRADING.ACCOUNT_USD_PRICE_PRECISION);
            let title = `Potential Loss -${roundedPotentialLoss.toFixed(2)}`;

            let pessimisticBalance = 0;
            let potentialLossPercentage = 0;
            let offsetPercentageText = "";

            if (hasValidInitialBalance) {
                pessimisticBalance = initialBalance - potentialLoss;
                potentialLossPercentage = (potentialLoss / initialBalance) * 100;

                if (potentialLossPercentage < 100) {
                    const offsetPercentage = (potentialLossPercentage / (100 - potentialLossPercentage)) * 100;
                    offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
                }
                title = `Potential Loss -${roundedPotentialLoss.toFixed(2)} (${pessimisticBalance.toFixed(2)}) (-${potentialLossPercentage.toFixed(2)}%)${offsetPercentageText}`;
            }

            wendy = {
                level: p.stopLevel,
                title: title
            };
        }

        // --- 3. LAMBO (TP) LOGIC ---
        let lambo = null;
        if (p.profitLevel) {
            const potentialProfit = Math.abs(p.level - p.profitLevel) * p.size;
            const roundedPotentialProfit = roundDownToFactor(potentialProfit, TRADING.ACCOUNT_USD_PRICE_PRECISION);
            let title = `Potential Profit +${roundedPotentialProfit.toFixed(2)}`;

            let optimisticBalance = 0;
            let potentialProfitPercentage = 0;
            let offsetProfitPercentage = 0;

            if (hasValidInitialBalance) {
                optimisticBalance = initialBalance + potentialProfit;
                potentialProfitPercentage = (potentialProfit / initialBalance) * 100;
                offsetProfitPercentage = (potentialProfitPercentage / (100 + potentialProfitPercentage)) * 100;

                title = `Potential Profit +${roundedPotentialProfit.toFixed(2)} (${optimisticBalance.toFixed(2)}) (+${potentialProfitPercentage.toFixed(2)}%) (+-${offsetProfitPercentage.toFixed(2)}%)`;
            }

            lambo = {
                level: p.profitLevel,
                title: title
            };
        }

        // --- 4. CURRENT (DYNAMIC) LOGIC (From ChartService.ts) ---
        let current = null;
        if (this.marketDetails) {
            const currentBid = this.marketDetails.snapshot.bid;
            const currentOfr = this.marketDetails.snapshot.offer;
            const currentPrice = p.direction === TRADING.BUY_DIRECTION ? currentBid : currentOfr;

            let profitOrLoss: number;
            if (p.direction === TRADING.BUY_DIRECTION) {
                profitOrLoss = (currentBid - p.level) * p.size;
            } else {
                profitOrLoss = (p.level - currentOfr) * p.size;
            }

            const PLUS = "+";
            const MINUS = "-";
            const profitOrLossSign = profitOrLoss >= 0 ? PLUS : MINUS;
            const profitOrLossRounded = roundDownToFactor(Math.abs(profitOrLoss), TRADING.ACCOUNT_USD_PRICE_PRECISION).toFixed(2);
            let title = `${profitOrLossSign}${profitOrLossRounded}`;

            if (hasValidInitialBalance) {
                const currentBalance = initialBalance + profitOrLoss;
                const percentage = (profitOrLoss / initialBalance) * 100;
                const percentageRounded = Math.abs(percentage).toFixed(2);

                let offsetPercentageText = "";
                if (percentage >= 0) {
                    const offsetPercentage = (percentage / (100 + percentage)) * 100;
                    offsetPercentageText = ` (+-${offsetPercentage.toFixed(2)}%)`;
                } else {
                    const absPercentage = Math.abs(percentage);
                    if (absPercentage < 100) {
                        const offsetPercentage = (absPercentage / (100 - absPercentage)) * 100;
                        offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
                    }
                }
                title = `${profitOrLossSign}${profitOrLossRounded} (${currentBalance.toFixed(2)}) (${profitOrLossSign}${percentageRounded}%)${offsetPercentageText}`;
            }

            current = {
                level: currentPrice,
                title: title,
                isProfit: profitOrLoss >= 0
            };
        }

        return {
            starting,
            wendy,
            lambo,
            current,
            initialBalance // Exposed for sanity check
        };
    }
}