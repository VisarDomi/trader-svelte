<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import AccountCard from '$lib/components/AccountCard.svelte';
    import * as TRADING from '$lib/constants/trading.js';
    import { session } from '$lib/services/session.js';

    // Stores
    import { positionStore } from '$lib/stores/position.svelte.js';
    import { accountStore } from '$lib/stores/account.svelte.js';
    import { viewport } from '$lib/services/viewport.svelte.js';

    // Utils
    import {
        generateStartingLine,
        generateWendyLine,
        generateLamboLine,
        generateCurrentLine
    } from '$lib/utils/lines.js';

    let pollInterval: ReturnType<typeof setInterval>;
    const precision = 2;

    // Derived State for Debug Info
    let debugInfo = $derived.by(() => {
        const p = positionStore.activePosition?.position;
        const m = positionStore.activePosition?.market;

        if (!p || !m) return null;

        const initialBalance = p.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;
        const symbol = accountStore.activeSymbol;

        const starting = generateStartingLine(p, m.epic, isLandscape);
        const wendy = generateWendyLine(p, initialBalance, symbol, isLandscape);
        const lambo = generateLamboLine(p, initialBalance, symbol, isLandscape);

        const currentPrice = p.direction === TRADING.BUY_DIRECTION ? m.bid : m.offer;
        const current = generateCurrentLine(p, currentPrice, initialBalance, symbol, isLandscape);

        return {
            starting,
            wendy,
            lambo,
            current,
            initialBalance
        };
    });

    onMount(async () => {
        const epic = session.lastEpic;
        if (epic) {
            await Promise.all([
                accountStore.init(),
                positionStore.init(epic)
            ]);
        }
        pollInterval = setInterval(() => {
            positionStore.refresh();
        }, 1000);
    });

    onDestroy(() => {
        clearInterval(pollInterval);
    });

    function fmt(price: number | undefined | null): string {
        if (price === undefined || price === null) return '—';
        return price.toFixed(precision);
    }
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Current Position</h1>
        <a href="/chart" style="color: #d1d4dc;">← Chart</a>
    </div>

    {#if accountStore.activeAccount}
        <AccountCard
                account={accountStore.activeAccount}
                mode={session.mode}
                badgeText={session.lastEpic}
        />
    {/if}

    {#if positionStore.isLoading && !positionStore.activePosition}
        <p>Loading position details...</p>
    {:else if positionStore.activePosition}
        {@const pos = positionStore.activePosition.position}
        {@const market = positionStore.activePosition.market}

        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333; display: flex; flex-direction: column; gap: 2rem;">

            <!-- Header: Direction & PnL -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid #333;">
                <div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: {pos.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}; line-height: 1;">
                        {pos.direction}
                    </div>
                    <div style="font-size: 1.2rem; font-weight: bold; margin-top: 0.5rem; color: #ccc;">
                        Size: {pos.size}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.9rem; color: #888;">UNREALIZED P&L</div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: {pos.upl >= 0 ? '#26a69a' : '#ef5350'}; line-height: 1;">
                        {pos.upl.toFixed(2)}
                    </div>
                </div>
            </div>

            <!-- Debug Info / Chart Lines (Uses centralized colors now) -->
            {#if debugInfo}
                <div style="background: #220033; padding: 1rem; border: 1px dashed #ff00ff; border-radius: 4px; font-family: monospace; font-size: 0.85rem; color: #ffccff;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <h4 style="color: #ff00ff; font-weight: bold; margin:0;">[DEBUG] CHART LINES</h4>
                        <span style="color: #aaa;">Initial Bal: {debugInfo.initialBalance.toFixed(2)}</span>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        {#if debugInfo.lambo}
                            <div style="border: 1px solid {debugInfo.lambo.color}; padding: 0.5rem; color: {debugInfo.lambo.color};">
                                <strong>LAMBO (TP):</strong> {debugInfo.lambo.price}
                                <div style="color: #ccc;">{debugInfo.lambo.title}</div>
                            </div>
                        {:else}
                            <div style="border: 1px solid #444; padding: 0.5rem; color: #666;">LAMBO (TP): Not Set</div>
                        {/if}

                        <div style="border: 1px solid {debugInfo.current.color}; padding: 0.5rem; color: {debugInfo.current.color};">
                            <strong>CURRENT:</strong> {debugInfo.current.price}
                            <div style="color: #ccc;">{debugInfo.current.title}</div>
                        </div>

                        <div style="border: 1px solid {debugInfo.starting.color}; padding: 0.5rem; color: {debugInfo.starting.color};">
                            <strong>STARTING:</strong> {debugInfo.starting.price}
                            <div style="color: #ccc;">{debugInfo.starting.title}</div>
                        </div>

                        {#if debugInfo.wendy}
                            <div style="border: 1px solid {debugInfo.wendy.color}; padding: 0.5rem; color: {debugInfo.wendy.color};">
                                <strong>WENDY (SL):</strong> {debugInfo.wendy.price}
                                <div style="color: #ccc;">{debugInfo.wendy.title}</div>
                            </div>
                        {:else}
                            <div style="border: 1px solid #444; padding: 0.5rem; color: #666;">WENDY (SL): Not Set</div>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Price Info -->
            <div>
                <h4 style="color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase;">Price Information</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Entry Level</span>
                        <div style="font-weight: bold; font-size: 1.2rem;">{fmt(pos.level)}</div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Current Market (Bid/Ask)</span>
                        <div style="font-weight: bold; font-size: 1.2rem;">
                            {fmt(market.bid)} / {fmt(market.offer)}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Protection -->
            <div>
                <h4 style="color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase;">Protection</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Stop Loss</span>
                        <div style="font-weight: bold; color: #ef5350;">
                            {fmt(pos.stopLevel)}
                        </div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Take Profit</span>
                        <div style="font-weight: bold; color: #26a69a;">
                            {fmt(pos.profitLevel)}
                        </div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Guaranteed</span>
                        <div style="font-weight: bold; color: #ddd;">
                            {pos.guaranteedStop ? 'YES' : 'NO'}
                        </div>
                    </div>
                </div>
            </div>

            <button
                    onclick={() => positionStore.close()}
                    disabled={positionStore.isClosing}
                    style="
                width: 100%;
                padding: 1.5rem;
                font-size: 1.2rem;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                background-color: #444;
                color: white;
                opacity: {positionStore.isClosing ? 0.5 : 1};
                margin-top: 1rem;
            ">
                {positionStore.isClosing ? 'CLOSING...' : 'CLOSE POSITION'}
            </button>
        </div>

    {:else}
        <div style="text-align: center; padding: 3rem; background: #1a1a1a; border-radius: 8px;">
            <p style="color: #888;">No active position found for {session.lastEpic}.</p>
            <a href="/chart" style="display: block; margin-top: 1rem; color: #26a69a; text-decoration: none;">Open Chart</a>
        </div>
    {/if}
</div>