<script lang="ts">
    import type { MarketDetailsResponse } from '$lib/types/market.js';
    import { InstrumentFormatter } from '$lib/presentation/formatters/InstrumentFormatter.js';
    import type { AccountPreferences } from '$lib/types/account.js';

    let {
        market,
        preferences,
        onSelect
    } = $props<{
        market: MarketDetailsResponse,
        preferences: AccountPreferences | null,
        onSelect: (epic: string) => void
    }>();

    let fmt = $derived(new InstrumentFormatter(preferences));
    let groupedHours = $derived(fmt.getGroupedHours(market));

    // UI State for expanding details
    let showDetails = $state(false);

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') onSelect(market.instrument.epic);
    }
</script>

<div class="card">
    <!-- Header (Always Visible) -->
    <div
            class="header"
            role="button"
            tabindex="0"
            onclick={() => onSelect(market.instrument.epic)}
            onkeydown={handleKeydown}
    >
        <div>
            <div class="name">{market.instrument.name}</div>
            <div class="meta">
                {market.instrument.epic} • {market.instrument.type}
            </div>
        </div>
        <div style="text-align: right;">
            <div
                    class="status"
                    style="color: {fmt.getMarketStatusColor(market.snapshot.marketStatus)}"
            >
                {market.snapshot.marketStatus}
            </div>
            <div class="leverage">
                Lev: <span style="color: white; font-weight: bold;">{fmt.getLeverageDisplay(market)}</span>
            </div>
        </div>
    </div>

    <div class="body">
        <!-- Prices Grid -->
        <div class="price-grid">
            <div>
                <div class="label">BID</div>
                <div class="price-val bid">
                    {fmt.formatPrice(market.snapshot.bid, market.snapshot.decimalPlacesFactor)}
                </div>
            </div>
            <div>
                <div class="label">OFFER</div>
                <div class="price-val offer">
                    {fmt.formatPrice(market.snapshot.offer, market.snapshot.decimalPlacesFactor)}
                </div>
            </div>
            <div>
                <div class="label">CHANGE</div>
                <div style="color: {fmt.getNetChangeColor(market.snapshot.netChange)}">
                    {market.snapshot.percentageChange}%
                </div>
            </div>
        </div>

        <!-- Toggle for Details -->
        <button class="toggle-btn" onclick={() => showDetails = !showDetails}>
            {showDetails ? 'Hide Details ▲' : 'Show Rules & Hours ▼'}
        </button>

        {#if showDetails}
            <!-- Detailed Info Section -->
            <div class="details-container">

                <!-- 1. Dealing Rules -->
                <div class="section">
                    <h4 class="section-title">Dealing Rules</h4>
                    <div class="rules-grid">
                        <div>
                            <span class="label">Min Deal:</span>
                            {market.dealingRules.minDealSize.value}
                        </div>
                        <div>
                            <span class="label">Max Deal:</span>
                            {market.dealingRules.maxDealSize.value}
                        </div>
                        <div>
                            <span class="label">Lot Size:</span>
                            {market.instrument.lotSize}
                        </div>
                    </div>
                </div>

                <!-- 2. Overnight Fees -->
                <div class="section">
                    <h4 class="section-title">Overnight Fees</h4>
                    <div class="split-row">
                        <div class="fee-box">
                            <span class="label">Long Rate</span>
                            <span class:negative={market.instrument.overnightFee?.longRate < 0}>
                                {market.instrument.overnightFee?.longRate ?? '-'}
                            </span>
                        </div>
                        <div class="fee-box">
                            <span class="label">Short Rate</span>
                            <span class:negative={market.instrument.overnightFee?.shortRate < 0}>
                                {market.instrument.overnightFee?.shortRate ?? '-'}
                            </span>
                        </div>
                    </div>
                    <div class="next-charge">
                        <span class="label">Next Charge:</span>
                        {fmt.getNextChargeTime(market)}
                    </div>
                </div>

                <!-- 3. Trading Hours -->
                <div class="section">
                    <h4 class="section-title">Trading Hours (Local)</h4>
                    <div class="hours-list">
                        {#each groupedHours as group}
                            <div class="hour-row">
                                <span class="days">{group.days}</span>
                                <div class="times">
                                    {#each group.hours as h}
                                        <span>{h}</span>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                        {#if groupedHours.length === 0}
                            <div class="hour-row">No hours available</div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .card {
        display: block;
        width: 100%;
        text-align: left;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
        color: inherit;
        transition: border-color 0.2s;
    }

    .header {
        padding: 1rem 1.5rem;
        background: #222;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #333;
        cursor: pointer;
    }
    .header:hover { background: #2a2a2a; }

    .name { font-size: 1.2rem; font-weight: bold; color: white; }
    .meta { color: #888; font-size: 0.8rem; margin-top: 0.2rem; }
    .status { font-size: 1rem; font-weight: bold; }
    .leverage { color: #aaa; font-size: 0.8rem; margin-top: 0.2rem; }

    .body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }

    .price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center; }
    .label { color: #888; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.25rem; }
    .price-val { font-size: 1.1rem; font-weight: bold; }
    .bid { color: #ef5350; }
    .offer { color: #26a69a; }

    .toggle-btn {
        background: #222;
        border: 1px solid #333;
        color: #888;
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        width: 100%;
        transition: color 0.2s;
    }
    .toggle-btn:hover { color: #ccc; border-color: #555; }

    .details-container {
        display: grid;
        gap: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #333;
        animation: slideDown 0.2s ease-out;
    }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

    .section-title { color: #666; margin-bottom: 0.5rem; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 4px; }

    .rules-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; font-size: 0.9rem; }

    /* Overnight Fees */
    .split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.5rem; }
    .fee-box { background: #222; padding: 0.5rem; border-radius: 4px; display: flex; flex-direction: column; align-items: center; }
    .negative { color: #aaa; } /* Rates are often negative meaning you pay */
    .next-charge { font-size: 0.8rem; color: #888; text-align: center; margin-top: 0.5rem; }

    /* Hours */
    .hours-list { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem; }
    .hour-row { display: flex; justify-content: space-between; border-bottom: 1px dashed #333; padding-bottom: 0.25rem; }
    .days { color: #fff; font-weight: bold; }
    .times { display: flex; flex-direction: column; align-items: flex-end; color: #aaa; }
</style>