import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';
import * as AUTH from '$lib/constants/auth.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import { getMarketDetails } from '$lib/services/market.js';
import { resolveInitialBalance } from '$lib/utils/position.js';
import {
    generateStartingLine,
    generateWendyLine,
    generateLamboLine,
    generateCurrentLine
} from '$lib/utils/lines.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { PositionResponse } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

export class PositionViewerLogic {
    activeType = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    isLoading = $state(true);
    isClosing = $state(false);
    error = $state('');

    currentAccount = $state<Account | null>(null);
    currentPosition = $state<PositionResponse | null>(null);
    marketDetails = $state<MarketDetailsResponse | null>(null);
    targetEpic = $state('');

    precision = $state(2);
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    async init() {
        if (typeof window === 'undefined') return;

        this.activeType = session.mode;
        this.targetEpic = session.lastEpic; // Uses the getter, defaults to NDX

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

    async load(isPolling = false) {
        if (!isPolling) this.isLoading = true;
        this.error = '';

        const client = session.getClient(this.activeType);
        if (!client) {
            if (!isPolling) await goto('/login');
            return;
        }

        try {
            const [accounts, positionsData, marketData] = await Promise.all([
                getSyncedAccounts(this.activeType, session.getTokens(this.activeType)!, client),
                getPositions(client),
                getMarketDetails(client, this.targetEpic).catch(() => null)
            ]);

            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;
            this.marketDetails = marketData;

            if (this.marketDetails) {
                this.precision = this.marketDetails.snapshot.decimalPlacesFactor;
            }

            const found = positionsData.positions.find(p => p.market.epic === this.targetEpic);

            if (found && this.currentAccount) {
                // Shared utility now uses SessionManager internally
                found.position.initialBalance = resolveInitialBalance(found.position, this.currentAccount);
            }

            this.currentPosition = found || null;

        } catch (e) {
            if (!isPolling) {
                this.error = e instanceof Error ? e.message : String(e);
            }
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
        const dealId = this.currentPosition.position.dealId;

        const client = session.getClient(this.activeType);
        if (!client) {
            notifications.error("Session expired");
            this.isClosing = false;
            return;
        }

        try {
            await createPosition(client, {
                epic: this.targetEpic,
                direction: oppositeDir,
                size
            });

            session.removeInitialBalance(dealId);

            notifications.success("Position closed successfully");
            await goto('/chart');

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.error = msg;
            notifications.error(msg);
            this.isClosing = false;
        }
    }

    get debugInfo() {
        if (!this.currentPosition) return null;

        const p = this.currentPosition.position;
        const initialBalance = p.initialBalance || 0;

        const starting = generateStartingLine(p, this.currentPosition.market.epic);
        const wendy = generateWendyLine(p, initialBalance);
        const lambo = generateLamboLine(p, initialBalance);

        let current = null;
        if (this.marketDetails) {
            const currentBid = this.marketDetails.snapshot.bid;
            const currentOfr = this.marketDetails.snapshot.offer;
            const currentPrice = p.direction === TRADING.BUY_DIRECTION ? currentBid : currentOfr;
            current = generateCurrentLine(p, currentPrice, initialBalance);
        }

        return {
            starting,
            wendy,
            lambo,
            current,
            initialBalance
        };
    }
}