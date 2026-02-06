<script lang="ts">
    import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
    import { InstrumentFormatter } from '$lib/domains/market/utils/InstrumentFormatter.js';
    import type { AccountPreferences } from '$lib/shared/types/account.js';

    let {
        market,
        preferences,
        collapsed = false, // New prop
        onSelect,
        onRemove = undefined
    } = $props<{
        market: MarketDetailsResponse,
        preferences: AccountPreferences | null,
        collapsed?: boolean,
        onSelect: (epic: string) => void,
        onRemove?: (epic: string) => void
    }>();

    let fmt = $derived(new InstrumentFormatter(preferences));

    // Safety check for detailed data
    let hasSchedule = $derived(
        market.instrument.openingHours &&
        Object.keys(market.instrument.openingHours).length > 1 // zone + at least one day
    );

    let groupedHours = $derived(hasSchedule ? fmt.getGroupedHours(market) : []);

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') onSelect(market.instrument.epic);
    }

    function stop(e: Event) {
        e.stopPropagation();
    }
</script>

<div class="card">
    <!-- Header -->
    <div
            class="header"
            class:no-border={collapsed}
            role="button"
            tabindex="0"
            onclick={() => onSelect(market.instrument.epic)}
            onkeydown={handleKeydown}
    >
        <div class="header-left">
            <div class="name">{market.instrument.name}</div>
            <div class="meta">
                {market.instrument.epic} • {market.instrument.type}
            </div>
        </div>
        <div class="header-right">
            <div
                    class="status"
                    style="color: {fmt.getMarketStatusColor(market.snapshot.marketStatus)}"
            >
                {market.snapshot.marketStatus}
            </div>

            {#if onRemove}
                <button
                        class="remove-btn"
                        onclick={(e) => { stop(e); onRemove(market.instrument.epic); }}
                >
                    −
                </button>
            {/if}
        </div>
    </div>

    {#if !collapsed}
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
                        {market.snapshot.percentageChange.toFixed(2)}%
                    </div>
                </div>
            </div>

            {#if hasSchedule}
                <div class="separator"></div>

                <!-- Detailed Info (Only Visible if details available) -->
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
                                <span class="kv-val" class:negative={(market.instrument.overnightFee?.longRate ?? 0) < 0}>
                                    {market.instrument.overnightFee?.longRate ?? '-'}%
                                </span>
                            </div>
                            <div class="kv-row">
                                <span class="kv-label">Short</span>
                                <span class="kv-val" class:negative={(market.instrument.overnightFee?.shortRate ?? 0) < 0}>
                                    {market.instrument.overnightFee?.shortRate ?? '-'}%
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 3. Trading Hours -->
                    <div class="section full-width">
                        <h4 class="section-title">Trading Hours</h4>
                        <div class="hours-container">
                            {#each groupedHours as group}
                                <div class="hours-row">
                                    <div class="days-label">{group.days}</div>
                                    <div class="time-list">
                                        {#each group.hours as h}
                                            <div class="time-item">{h}</div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
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

    /* Remove border when body is hidden */
    .header.no-border { border-bottom: none; }

    .header-right { display: flex; align-items: center; gap: 1rem; }

    .name { font-size: 1.2rem; font-weight: bold; color: white; }
    .meta { color: #888; font-size: 0.8rem; margin-top: 0.2rem; }
    .status { font-size: 1rem; font-weight: bold; }

    .remove-btn {
        background: #333;
        color: #ef5350;
        border: 1px solid #ef5350;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        font-size: 1.2rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-bottom: 3px;
    }
    .remove-btn:hover { background: #ef5350; color: white; }

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

    .section-title { color: #d1d4dc; margin-bottom: 0.25rem; font-size: 0.85rem; font-weight: bold; }
    .full-width { grid-column: 1 / -1; }

    /* Key-Value Lists */
    .key-val-list { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem; }
    .kv-row { display: flex; justify-content: space-between; padding-bottom: 0.25rem; border-bottom: 1px solid #2a2a2a; }
    .kv-label { color: #aaa; }
    .kv-val { font-weight: bold; color: #fff; }
    .negative { color: #aaa; }

    /* Hours specific layout */
    .hours-container { display: flex; flex-direction: column; gap: 0.5rem; }
    .hours-row { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 0.25rem; border-bottom: 1px solid #2a2a2a; }
    .days-label { color: #aaa; font-size: 0.9rem; }
    .time-list { display: flex; flex-direction: column; align-items: flex-end; }
    .time-item { color: #fff; font-weight: bold; font-size: 0.9rem; font-family: monospace; }
</style>