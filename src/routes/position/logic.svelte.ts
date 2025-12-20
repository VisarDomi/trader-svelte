import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { getSyncedAccounts, getPreferences } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import { getMarketDetails } from '$lib/services/market.js';
import { calculatePositionParameters, type TradeCalculationResult } from '$lib/utils/trading.js';
import type { Account, LeverageCategory } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { PositionResponse, Direction, TradeRequest } from '$lib/types/trading.js';

export class PositionLogic {
    activeType = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    isLoading = $state(true);
    isTrading = $state(false);
    error = $state('');
    message = $state('');

    currentAccount = $state<Account | null>(null);
    currentPosition = $state<PositionResponse | null>(null);
    plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);

    targetEpic = TRADING.NDX_EPIC;
    defaultSize = 0.1;

    async init() {
        if (typeof window === 'undefined') return;

        // 1. Determine Type
        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.activeType = storedMode || AUTH.DEMO_TYPE;

        // 2. Parse URL Params
        const params = new URLSearchParams(window.location.search);
        const epicParam = params.get('epic');
        if (epicParam) this.targetEpic = epicParam;

        const dirParam = params.get('direction') as Direction | null;
        const priceParam = params.get('price'); // Click Price (TP)
        const bidParam = params.get('bid');
        const ofrParam = params.get('ofr');

        if (dirParam && priceParam && bidParam && ofrParam) {
            await this.calculateSetup(dirParam, parseFloat(priceParam), parseFloat(bidParam), parseFloat(ofrParam));
        } else {
            await this.load();
        }
    }

    private getTokens(type: URL_TYPE): SessionTokens | null {
        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);
        if (!tokensStr) return null;
        return JSON.parse(tokensStr);
    }

    /**
     * Standard load: fetches account and existing position
     */
    async load() {
        this.isLoading = true;
        this.error = '';
        this.message = '';
        this.currentAccount = null;
        this.currentPosition = null;
        this.plannedTrade = null;

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

            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);
            this.currentPosition = found || null;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Setup flow: fetches everything needed to calc Full Port size
     */
    async calculateSetup(direction: Direction, clickPrice: number, bid: number, ofr: number) {
        this.isLoading = true;
        this.plannedTrade = null;
        this.error = '';

        const tokens = this.getTokens(this.activeType);
        if (!tokens) {
            await goto('/login');
            return;
        }

        try {
            // 1. Fetch Account, Prefs, Market Rules
            const [accounts, prefs, market] = await Promise.all([
                getSyncedAccounts(this.activeType, tokens),
                getPreferences(this.activeType, tokens),
                getMarketDetails(this.activeType, tokens, this.targetEpic)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;
            if (!this.currentAccount) throw new Error("No active account found");

            // 2. Determine Leverage
            const category = market.instrument.type as LeverageCategory;
            let leverage = 1;

            if (prefs.leverages[category]) {
                leverage = prefs.leverages[category].current;
            } else if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
                leverage = 100 / market.instrument.marginFactor;
            }

            // 3. Determine Entry Price
            // Buy at Offer, Sell at Bid
            const entryPrice = direction === TRADING.BUY_DIRECTION ? ofr : bid;

            // 4. Calculate
            const result = calculatePositionParameters({
                accountBalance: this.currentAccount.balance.available,
                leverage,
                entryPrice,
                lotSize: market.instrument.lotSize || 1,
                minSizeIncrement: market.dealingRules.minSizeIncrement.value,
                minDealSize: market.dealingRules.minDealSize.value,
                decimalPlaces: market.snapshot.decimalPlacesFactor,
                direction,
                clickPrice,
                stopLossRatio: TRADING.STOP_LOSS_RATIO
            });

            if (!result) {
                this.error = "Insufficient funds for minimum trade size.";
            } else {
                this.plannedTrade = {
                    ...result,
                    direction,
                    entryPrice
                };
            }

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    async confirmTrade() {
        if (!this.plannedTrade) return;
        await this.executeTrade(
            this.plannedTrade.direction,
            this.plannedTrade.size,
            this.plannedTrade.stopLevel,
            this.plannedTrade.profitLevel
        );
    }

    async openPosition(direction: Direction) {
        await this.executeTrade(direction, this.defaultSize);
    }

    async closePosition() {
        if (!this.currentPosition) return;
        const currentDir = this.currentPosition.position.direction;
        const oppositeDir = currentDir === TRADING.BUY_DIRECTION ? TRADING.SELL_DIRECTION : TRADING.BUY_DIRECTION;
        const size = this.currentPosition.position.size;

        // Simple close without SL/TP
        await this.executeTrade(oppositeDir, size);
    }

    private async executeTrade(direction: Direction, size: number, stopLevel?: number, profitLevel?: number) {
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
            const body: TradeRequest = {
                epic: this.targetEpic,
                direction,
                size,
                // Only add stops if provided (Confirm Flow)
                ...(stopLevel && { stopLevel }),
                ...(profitLevel && { profitLevel })
            };

            await createPosition(this.activeType, tokens, body);

            this.message = "Order executed successfully";

            // On success, go back to chart
            await goto('/chart');

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            // If failed, reload normal view to prevent stuck state
            await this.load();
        } finally {
            this.isTrading = false;
        }
    }
}