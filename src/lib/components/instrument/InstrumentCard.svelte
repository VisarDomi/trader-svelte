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

    // Instantiate Formatter derived from props
    let fmt = $derived(new InstrumentFormatter(preferences));

    // Handler for accessibility
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') onSelect(market.instrument.epic);
    }
</script>

<div
        role="button"
        tabindex="0"
        onclick={() => onSelect(market.instrument.epic)}
        onkeydown={handleKeydown}
        class="card"
>
    <!-- Header -->
    <div class="header">
        <div>
            <div class="name">{market.instrument.name}</div>
            <div class="meta">
                {market.instrument.epic} • {market.instrument.type} • {market.instrument.currency}
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
                <div class="label">NET CHANGE</div>
                <div style="color: {fmt.getNetChangeColor(market.snapshot.netChange)}">
                    {market.snapshot.netChange} ({market.snapshot.percentageChange}%)
                </div>
            </div>
            <div>
                <div class="label">RANGE (H/L)</div>
                <div>{market.snapshot.high} / {market.snapshot.low}</div>
            </div>
        </div>

        <!-- Dealing Rules -->
        <div class="section">
            <h4 class="section-title">Dealing Rules</h4>
            <div class="rules-grid">
                <div>
                    <span class="label">Min Deal:</span>
                    {market.dealingRules.minDealSize.value} {market.dealingRules.minDealSize.unit}
                </div>
                <div>
                    <span class="label">Max Deal:</span>
                    {market.dealingRules.maxDealSize.value}
                </div>
                <div>
                    <span class="label">Step:</span>
                    {market.dealingRules.minSizeIncrement.value}
                </div>
                <div>
                    <span class="label">Min Stop Dist:</span>
                    {market.dealingRules.minStopOrProfitDistance?.value ?? '-'}%
                </div>
                <div>
                    <span class="label">Lot Size:</span>
                    {market.instrument.lotSize}
                </div>
            </div>
        </div>

        <!-- Fees & Hours -->
        <div class="split-section">
            <!-- Overnight Fees -->
            <div>
                <h4 class="section-title">Overnight Fees</h4>
                {#if market.instrument.overnightFee}
                    <div class="info-text">
                        <div class="row">
                            <span class="label">Long Rate:</span>
                            <span>{market.instrument.overnightFee.longRate}</span>
                        </div>
                        <div class="row">
                            <span class="label">Short Rate:</span>
                            <span>{market.instrument.overnightFee.shortRate}</span>
                        </div>
                    </div>
                {:else}
                    <span class="info-text">None</span>
                {/if}
            </div>

            <!-- Schedule -->
            <div>
                <h4 class="section-title">Schedule</h4>
                <div class="info-text">
                    <div class="row">
                        <span class="label">Zone:</span>
                        <span>{market.instrument.openingHours.zone}</span>
                    </div>
                    <div class="row">
                        <span class="label">Update:</span>
                        <span>{new Date(market.snapshot.updateTime).toLocaleTimeString()}</span>
                    </div>
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
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s;
    }
    .card:hover, .card:focus {
        border-color: #666;
    }

    .header {
        padding: 1.5rem;
        background: #222;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #333;
    }
    .name { font-size: 1.5rem; font-weight: bold; color: white; }
    .meta { color: #888; margin-top: 0.25rem; font-family: monospace; }
    .status { font-size: 1.2rem; font-weight: bold; }
    .leverage { color: #aaa; font-size: 0.9rem; margin-top: 0.25rem; }

    .body { padding: 1.5rem; display: grid; gap: 1.5rem; }

    .price-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 1rem; }
    .label { color: #888; font-size: 0.8rem; }
    .price-val { font-size: 1.2rem; font-weight: bold; }
    .bid { color: #ef5350; }
    .offer { color: #26a69a; }

    .section { border-top: 1px solid #333; padding-top: 1rem; }
    .split-section { border-top: 1px solid #333; padding-top: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    .section-title { color: #666; margin-bottom: 0.75rem; font-size: 0.8rem; text-transform: uppercase; }

    .rules-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; font-size: 0.9rem; }
    .info-text { font-size: 0.9rem; }
    .row { display: flex; justify-content: space-between; }
</style>