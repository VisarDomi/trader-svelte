<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';

    // Services & Stores
    import { accountStore } from '$lib/stores/account.svelte.js';
    import { api } from '$lib/services/api.svelte.js';
    import { notifications } from '$lib/services/notifications.svelte.js';
    import { getMarketDetails } from '$lib/services/market.js';
    import { getPreferences } from '$lib/services/account.js';
    import { createPosition, getConfirmation } from '$lib/services/trading.js';
    import { session } from '$lib/services/session.js';

    // Utils & Types
    import { calculatePositionParameters, type TradeCalculationResult } from '$lib/utils/trading.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as AUTH from '$lib/constants/auth.js';
    import type { Direction, TradeRequest } from '$lib/types/trading.js';
    import type { LeverageCategory } from '$lib/types/account.js';

    // Local State
    let isLoading = $state(true);
    let isExecuting = $state(false);
    let error = $state('');
    let plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);
    let targetEpic = $state(TRADING.NDX_EPIC);

    onMount(async () => {
        await accountStore.init();
        await initSetup();
    });

    async initSetup() {
        const search = page.url.searchParams;
        const epicParam = search.get('epic');
        if (epicParam) targetEpic = epicParam;

        const dirParam = search.get('direction') as Direction | null;
        const priceParam = search.get('price');
        const bidParam = search.get('bid');
        const ofrParam = search.get('ofr');

        if (dirParam && priceParam && bidParam && ofrParam) {
            await calculateSetup(
                dirParam,
                parseFloat(priceParam),
                parseFloat(bidParam),
                parseFloat(ofrParam)
            );
        } else {
            // If missing params, redirect to position view
            goto('/position');
        }
    }

    async calculateSetup(direction: Direction, clickPrice: number, bid: number, ofr: number) {
        isLoading = true;
        error = '';
        plannedTrade = null;

        const client = api.client;
        if (!client) {
            notifications.error("Session expired.");
            await goto('/login');
            return;
        }

        try {
            const [market, prefs] = await Promise.all([
                getMarketDetails(client, targetEpic),
                getPreferences(client)
            ]);

            const currentAccount = accountStore.activeAccount;
            if (!currentAccount) throw new Error("No active account found");

            // Determine Leverage
            const category = market.instrument.type as LeverageCategory;
            let leverage = 1;

            if (prefs.leverages[category]) {
                leverage = prefs.leverages[category].current;
            } else if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
                leverage = 100 / market.instrument.marginFactor;
            }

            const entryPrice = direction === TRADING.BUY_DIRECTION ? ofr : bid;

            const result = calculatePositionParameters({
                accountBalance: currentAccount.balance.available,
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
                error = "Insufficient funds for minimum trade size.";
            } else {
                plannedTrade = {
                    ...result,
                    direction,
                    entryPrice
                };
            }

        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            notifications.error("Failed to calculate trade parameters");
        } finally {
            isLoading = false;
        }
    }

    async function confirmTrade() {
        if (!plannedTrade || !accountStore.activeAccount) return;

        isExecuting = true;
        error = '';
        const client = api.client;

        if (!client) {
            notifications.error("Session expired");
            isExecuting = false;
            return;
        }

        try {
            const initialBalanceSnapshot = accountStore.activeAccount.balance.deposit;

            const body: TradeRequest = {
                epic: targetEpic,
                direction: plannedTrade.direction,
                size: plannedTrade.size,
                stopLevel: plannedTrade.stopLevel,
                profitLevel: plannedTrade.profitLevel
            };

            const response = await createPosition(client, body);
            const confirmation = await getConfirmation(client, response.dealReference);

            session.setInitialBalance(confirmation.dealId, initialBalanceSnapshot);

            // Update global store balance immediately
            accountStore.updateBalance(initialBalanceSnapshot);

            notifications.success(`${confirmation.direction} ${confirmation.size} ${targetEpic} Executed`);
            await goto('/position');

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            error = msg;
            notifications.error(msg);
        } finally {
            isExecuting = false;
        }
    }
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Setup Trade</h1>
        <a href="/chart" style="color: #d1d4dc;">← Cancel</a>
    </div>

    <!-- Active Account Banner -->
    {#if accountStore.activeAccount}
        <div style="
            margin-bottom: 2rem;
            padding: 1rem;
            background: #262626;
            border-radius: 4px;
            border-left: 4px solid {session.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div>
                <div style="font-weight: bold; font-size: 1.1rem; color: #fff;">
                    {accountStore.activeAccount.accountName}
                </div>
                <div style="font-size: 0.8rem; margin-top: 0.25rem;">
                    Available: {accountStore.activeAccount.symbol}{accountStore.activeAccount.balance.available.toFixed(2)}
                </div>
            </div>
            <div style="font-weight: bold; font-size: 1.2rem; color: {session.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'}">
                {session.mode}
            </div>
        </div>
    {/if}

    {#if error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {error}
        </div>
    {/if}

    {#if isLoading}
        <p>Calculating trade parameters...</p>
    {:else if plannedTrade}
        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333;">
            <h2 style="margin-bottom: 1.5rem; color: #d1d4dc; text-align: center;">Confirm Full Port Trade</h2>

            <div style="
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                background: #222;
                padding: 1rem;
                border-radius: 4px;
                margin-bottom: 2rem;
            ">
                <div style="color: #888;">Epic</div>
                <div style="font-weight: bold;">{targetEpic}</div>

                <div style="color: #888;">Direction</div>
                <div style="font-weight: bold; color: {plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                    {plannedTrade.direction}
                </div>

                <div style="color: #888;">Size</div>
                <div style="font-weight: bold; font-size: 1.2rem;">{plannedTrade.size}</div>

                <div style="color: #888;">Entry</div>
                <div>{plannedTrade.entryPrice}</div>

                <div style="color: #888;">Take Profit</div>
                <div style="color: #26a69a; font-weight: bold;">{plannedTrade.profitLevel}</div>

                <div style="color: #888;">Stop Loss</div>
                <div style="color: #ef5350; font-weight: bold;">{plannedTrade.stopLevel}</div>

                <div style="color: #888;">Margin Req</div>
                <div>{plannedTrade.marginRequired.toFixed(2)}</div>
            </div>

            <button
                    onclick={() => confirmTrade()}
                    disabled={isExecuting}
                    style="
                width: 100%;
                padding: 1.5rem;
                font-size: 1.5rem;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                color: white;
                background-color: {plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'};
                opacity: {isExecuting ? 0.5 : 1};
            ">
                {isExecuting ? 'EXECUTING...' : `CONFIRM ${plannedTrade.direction}`}
            </button>
        </div>
    {/if}
</div>