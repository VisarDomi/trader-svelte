<script lang="ts">
    import { onMount } from 'svelte';
    import { PositionViewerLogic } from './logic.svelte.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as AUTH from '$lib/constants/auth.js';

    const logic = new PositionViewerLogic();

    onMount(() => {
        logic.init();
    });

    // Helper to format prices safely
    function fmt(price: number | undefined | null): string {
        if (price === undefined || price === null) return '—';
        return price.toFixed(logic.precision);
    }
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Current Position</h1>
        <a href="/chart" style="color: #d1d4dc;">← Chart</a>
    </div>

    {#if logic.currentAccount}
        <div style="
            margin-bottom: 2rem;
            padding: 1rem;
            background: #262626;
            border-radius: 4px;
            border-left: 4px solid {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            display: flex;
            justify-content: space-between;
        ">
            <div>
                <span style="font-weight: bold;">{logic.currentAccount.accountName}</span>
                <span style="font-size: 0.8rem; color: #aaa; margin-left: 0.5rem;">{logic.targetEpic}</span>
            </div>
            <div style="font-weight: bold;">
                {logic.currentAccount.symbol}{logic.currentAccount.balance.balance.toFixed(2)}
            </div>
        </div>
    {/if}

    {#if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {logic.error}
        </div>
    {/if}

    {#if logic.isLoading}
        <p>Loading position details...</p>
    {:else if logic.currentPosition}
        <!-- Position Dashboard -->
        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333; display: flex; flex-direction: column; gap: 2rem;">

            <!-- 1. Headline (Dir, Size, P&L) -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid #333;">
                <div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: {logic.currentPosition.position.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}; line-height: 1;">
                        {logic.currentPosition.position.direction}
                    </div>
                    <div style="font-size: 1.2rem; font-weight: bold; margin-top: 0.5rem; color: #ccc;">
                        Size: {logic.currentPosition.position.size}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.9rem; color: #888;">UNREALIZED P&L</div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: {logic.currentPosition.position.upl >= 0 ? '#26a69a' : '#ef5350'}; line-height: 1;">
                        {logic.currentPosition.position.upl.toFixed(2)}
                    </div>
                </div>
            </div>

            <!-- DEBUG CARD: The 4 Lines -->
            {#if logic.debugInfo}
                <div style="background: #220033; padding: 1rem; border: 1px dashed #ff00ff; border-radius: 4px; font-family: monospace; font-size: 0.85rem; color: #ffccff;">
                    <h4 style="margin-bottom: 0.5rem; color: #ff00ff; font-weight: bold;">[DEBUG] CHART LINE CALCS</h4>

                    <div style="margin-bottom: 0.5rem;">
                        <div><span style="color:#aaa;">Initial Balance:</span> {logic.debugInfo.initialBalance.toFixed(2)}</div>
                        <div><span style="color:#aaa;">Size:</span> {logic.debugInfo.size}</div>
                        <div><span style="color:#aaa;">Entry:</span> {logic.debugInfo.entry}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <!-- LAMBO -->
                        <div style="border: 1px solid #26a69a; padding: 0.5rem;">
                            <strong style="color: #26a69a;">LAMBO (TP)</strong>
                            {#if logic.debugInfo.lambo}
                                <div>Level: {logic.debugInfo.lambo.level}</div>
                                <div>Profit: +{logic.debugInfo.lambo.profitVal.toFixed(2)}</div>
                                <div>Proj. Bal: {logic.debugInfo.lambo.balance.toFixed(2)}</div>
                                <div>Direct %: {logic.debugInfo.lambo.pct.toFixed(2)}%</div>
                                <div>Offset %: {logic.debugInfo.lambo.offsetPct.toFixed(2)}%</div>
                            {:else}
                                <div style="color: #666;">Not Set</div>
                            {/if}
                        </div>

                        <!-- WENDY -->
                        <div style="border: 1px solid #ef5350; padding: 0.5rem;">
                            <strong style="color: #ef5350;">WENDY (SL)</strong>
                            {#if logic.debugInfo.wendy}
                                <div>Level: {logic.debugInfo.wendy.level}</div>
                                <div>Loss: -{logic.debugInfo.wendy.lossVal.toFixed(2)}</div>
                                <div>Proj. Bal: {logic.debugInfo.wendy.balance.toFixed(2)}</div>
                                <div>Direct %: {logic.debugInfo.wendy.pct.toFixed(2)}%</div>
                                <div>Offset %: {logic.debugInfo.wendy.offsetPct.toFixed(2)}%</div>
                            {:else}
                                <div style="color: #666;">Not Set</div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}

            <!-- 2. Price Data -->
            <div>
                <h4 style="color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase;">Price Information</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Entry Level</span>
                        <div style="font-weight: bold; font-size: 1.2rem;">{fmt(logic.currentPosition.position.level)}</div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Current Market (Bid/Ask)</span>
                        <div style="font-weight: bold; font-size: 1.2rem;">
                            {fmt(logic.currentPosition.market.bid)} / {fmt(logic.currentPosition.market.offer)}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Stops & Limits -->
            <div>
                <h4 style="color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase;">Protection</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Stop Loss</span>
                        <div style="font-weight: bold; color: #ef5350;">
                            {fmt(logic.currentPosition.position.stopLevel)}
                        </div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Take Profit</span>
                        <div style="font-weight: bold; color: #26a69a;">
                            {fmt(logic.currentPosition.position.profitLevel)}
                        </div>
                    </div>
                    <div style="background: #222; padding: 1rem; border-radius: 4px;">
                        <span style="color: #888; font-size: 0.85rem;">Guaranteed</span>
                        <div style="font-weight: bold; color: #ddd;">
                            {logic.currentPosition.position.guaranteedStop ? 'YES' : 'NO'}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. Market Meta -->
            <div>
                <h4 style="color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase;">Market Details</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 0.9rem;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">
                        <span style="color: #888;">Net Change</span>
                        <span style="color: {logic.currentPosition.market.netChange >= 0 ? '#26a69a' : '#ef5350'}">
                            {logic.currentPosition.market.netChange} ({logic.currentPosition.market.percentageChange}%)
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">
                        <span style="color: #888;">Daily Range</span>
                        <span>{fmt(logic.currentPosition.market.high)} - {fmt(logic.currentPosition.market.low)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">
                        <span style="color: #888;">Status</span>
                        <span>{logic.currentPosition.market.marketStatus}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">
                        <span style="color: #888;">Leverage Used</span>
                        <span>1:{logic.currentPosition.position.leverage}</span>
                    </div>
                </div>
            </div>

            <!-- 5. Trade Metadata -->
            <div style="font-size: 0.8rem; color: #666; display: flex; flex-direction: column; gap: 0.25rem;">
                <div>Deal ID: {logic.currentPosition.position.dealId}</div>
                <div>Deal Ref: {logic.currentPosition.position.dealReference}</div>
                <div>Opened: {new Date(logic.currentPosition.position.createdDate).toLocaleString()}</div>
                <div>Contract Size: {logic.currentPosition.position.contractSize}</div>
            </div>

            <button
                    onclick={() => logic.closePosition()}
                    disabled={logic.isClosing}
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
                opacity: {logic.isClosing ? 0.5 : 1};
                margin-top: 1rem;
            ">
                {logic.isClosing ? 'CLOSING...' : 'CLOSE POSITION'}
            </button>
        </div>

    {:else}
        <div style="text-align: center; padding: 3rem; background: #1a1a1a; border-radius: 8px;">
            <p style="color: #888;">No active position found for {logic.targetEpic}.</p>
            <a href="/chart" style="display: block; margin-top: 1rem; color: #26a69a; text-decoration: none;">Open Chart</a>
        </div>
    {/if}
</div>