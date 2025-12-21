import { goto } from '$app/navigation';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import { session } from '$lib/services/session.js';
import { getSyncedAccounts, getPreferences } from '$lib/services/account.js';
import { createPosition, getConfirmation } from '$lib/services/trading.js';
import { getMarketDetails } from '$lib/services/market.js';
import { calculatePositionParameters, type TradeCalculationResult } from '$lib/utils/trading.js';
import type { Account, LeverageCategory } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { Direction, TradeRequest } from '$lib/types/trading.js';

export class TradeLogic {
    activeType = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    isLoading = $state(true);
    isTrading = $state(false);
    error = $state('');
    message = $state('');

    currentAccount = $state<Account | null>(null);
    plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);

    targetEpic = TRADING.NDX_EPIC;

    async init() {
        if (typeof window === 'undefined') return;

        this.activeType = session.mode;

        const params = new URLSearchParams(window.location.search);
        const epicParam = params.get('epic');
        if (epicParam) this.targetEpic = epicParam;

        const dirParam = params.get('direction') as Direction | null;
        const priceParam = params.get('price');
        const bidParam = params.get('bid');
        const ofrParam = params.get('ofr');

        if (dirParam && priceParam && bidParam && ofrParam) {
            await this.calculateSetup(dirParam, parseFloat(priceParam), parseFloat(bidParam), parseFloat(ofrParam));
        } else {
            goto('/position');
        }
    }

    async calculateSetup(direction: Direction, clickPrice: number, bid: number, ofr: number) {
        this.isLoading = true;
        this.plannedTrade = null;
        this.error = '';

        const client = session.getClient(this.activeType);
        if (!client) {
            await goto('/login');
            return;
        }

        try {
            const [accounts, prefs, market] = await Promise.all([
                getSyncedAccounts(this.activeType, session.getTokens(this.activeType)!, client),
                getPreferences(client),
                getMarketDetails(client, this.targetEpic)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;
            if (!this.currentAccount) throw new Error("No active account found");

            const category = market.instrument.type as LeverageCategory;
            let leverage = 1;

            if (prefs.leverages[category]) {
                leverage = prefs.leverages[category].current;
            } else if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
                leverage = 100 / market.instrument.marginFactor;
            }

            const entryPrice = direction === TRADING.BUY_DIRECTION ? ofr : bid;

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
        if (!this.plannedTrade || !this.currentAccount) return;
        this.isTrading = true;
        this.error = '';

        const client = session.getClient(this.activeType);
        if (!client) {
            this.error = "Session expired";
            this.isTrading = false;
            return;
        }

        try {
            // 1. CAPTURE SNAPSHOT
            const initialBalanceSnapshot = this.currentAccount.balance.deposit;

            // 2. CREATE POSITION
            const body: TradeRequest = {
                epic: this.targetEpic,
                direction: this.plannedTrade.direction,
                size: this.plannedTrade.size,
                stopLevel: this.plannedTrade.stopLevel,
                profitLevel: this.plannedTrade.profitLevel
            };

            const response = await createPosition(client, body);

            // 3. GET CONFIRMATION
            const confirmation = await getConfirmation(client, response.dealReference);

            // 4. SAVE INITIAL BALANCE KEYED BY DEAL ID
            session.setInitialBalance(confirmation.dealId, initialBalanceSnapshot);

            // 5. REDIRECT
            await goto('/position');

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            this.isTrading = false;
        }
    }
}