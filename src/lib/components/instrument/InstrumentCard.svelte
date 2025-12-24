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

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') onSelect(market.instrument.epic);
    }
</script>

<div class="card">
    <!-- Header -->
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

        <div class="separator"></div>

        <!-- Detailed Info (Always Visible) -->
        <div class="details-grid">

            <!-- 1. Dealing Rules -->
            <div class="section">
                <h4 class="section-title">Dealing Rules</h4>
                <div class="key-val-list">
                    <div class="kv-row">
                        <span class="kv-label">Min Deal</span>
                        <span class="kv-val">{market.dealingRules.minDealSize.value}</span>
                    </div>
                    <div class="kv-row">
                        <span class="kv-label">Max Deal</span>
                        <span class="kv-val">{market.dealingRules.maxDealSize.value}</span>
                    </div>
                    <div class="kv-row">
                        <span class="kv-label">Lot Size</span>
                        <span class="kv-val">{market.instrument.lotSize}</span>
                    </div>
                </div>
            </div>

            <!-- 2. Overnight Fees -->
            <div class="section">
                <h4 class="section-title">Overnight Fees</h4>
                <div class="key-val-list">
                    <div class="kv-row">
                        <span class="kv-label">Long</span>
                        <span class="kv-val" class:negative={market.instrument.overnightFee?.longRate < 0}>
                            {market.instrument.overnightFee?.longRate ?? '-'}
                        </span>
                    </div>
                    <div class="kv-row">
                        <span class="kv-label">Short</span>
                        <span class="kv-val" class:negative={market.instrument.overnightFee?.shortRate < 0}>
                            {market.instrument.overnightFee?.shortRate ?? '-'}
                        </span>
                    </div>
                    <div class="kv-row">
                        <span class="kv-label">Next</span>
                        <span class="kv-val">{fmt.getNextChargeTime(market)}</span>
                    </div>
                </div>
            </div>

            <!-- 3. Trading Hours -->
            <div class="section full-width">
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
                        <div class="hour-row" style="color:#666">Schedule unavailable</div>
                    {/if}
                </div>
            </div>
        </div>
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

    .body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

    .price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center; }
    .label { color: #888; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.25rem; }
    .price-val { font-size: 1.1rem; font-weight: bold; }
    .bid { color: #ef5350; }
    .offer { color: #26a69a; }

    .separator { height: 1px; background: #333; margin: 0 -1.5rem; }

    /* Layout for Details: 2 columns on desktop, 1 on mobile */
    .details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
    }
    @media (max-width: 600px) {
        .details-grid { grid-template-columns: 1fr; gap: 1.5rem; }
    }

    .section-title { color: #666; margin-bottom: 0.75rem; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .full-width { grid-column: 1 / -1; }

    /* Key-Value Lists */
    .key-val-list { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9rem; }
    .kv-row { display: flex; justify-content: space-between; }
    .kv-label { color: #aaa; }
    .kv-val { font-weight: bold; color: #fff; }
    .negative { color: #aaa; }

    /* Hours */
    .hours-list { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9rem; }
    .hour-row { display: flex; justify-content: space-between; border-bottom: 1px dashed #333; padding-bottom: 0.25rem; }
    .days { color: #fff; font-weight: bold; }
    .times { display: flex; flex-direction: column; align-items: flex-end; color: #aaa; text-align: right; }
</style>