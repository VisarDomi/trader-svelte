<script lang="ts">
    import { onMount } from 'svelte';
    import { InstrumentLogic } from './logic.svelte.js';
    const logic = new InstrumentLogic();

    onMount(() => {
        logic.init();
    });
</script>

<div style="padding: 1rem; max-width: 900px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Select Instrument</h1>
        <a href="/chart" style="color: #d1d4dc;">← Back</a>
    </div>

    {#if logic.isLoading}
        <p>Fetching detailed market data...</p>
    {:else if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px;">
            {logic.error}
        </div>
    {:else}
        <div style="display: grid; gap: 2rem;">
            {#each logic.instruments as m}
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => logic.select(m.instrument.epic)}
                        onkeydown={(e) => e.key === 'Enter' && logic.select(m.instrument.epic)}
                        style="
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
                    "
                        onmouseover={(e) => e.currentTarget.style.borderColor = '#666'}
                        onmouseout={(e) => e.currentTarget.style.borderColor = '#333'}
                        onfocus={(e) => e.currentTarget.style.borderColor = '#666'}
                        onblur={(e) => e.currentTarget.style.borderColor = '#333'}
                >
                    <!-- Header -->
                    <div style="
                        padding: 1.5rem;
                        background: #222;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #333;
                    ">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: white;">
                                {m.instrument.name}
                            </div>
                            <div style="color: #888; margin-top: 0.25rem; font-family: monospace;">
                                {m.instrument.epic} • {m.instrument.type} • {m.instrument.currency}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="
                                font-size: 1.2rem;
                                font-weight: bold;
                                color: {m.snapshot.marketStatus === 'TRADEABLE' ? '#26a69a' : '#ef5350'};
                             ">
                                {m.snapshot.marketStatus}
                            </div>
                            <div style="color: #aaa; font-size: 0.9rem; margin-top: 0.25rem;">
                                Lev: <span style="color: white; font-weight: bold;">{logic.getUserLeverage(m)}</span>
                            </div>
                        </div>
                    </div>

                    <div style="padding: 1.5rem; display: grid; gap: 1.5rem;">

                        <!-- Prices Section -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 1rem;">
                            <div>
                                <div style="color: #888; font-size: 0.8rem;">BID</div>
                                <div style="font-size: 1.2rem; font-weight: bold; color: #ef5350;">
                                    {m.snapshot.bid.toFixed(m.snapshot.decimalPlacesFactor)}
                                </div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 0.8rem;">OFFER</div>
                                <div style="font-size: 1.2rem; font-weight: bold; color: #26a69a;">
                                    {m.snapshot.offer.toFixed(m.snapshot.decimalPlacesFactor)}
                                </div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 0.8rem;">NET CHANGE</div>
                                <div style="color: {m.snapshot.netChange >= 0 ? '#26a69a' : '#ef5350'}">
                                    {m.snapshot.netChange} ({m.snapshot.percentageChange}%)
                                </div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 0.8rem;">RANGE (H/L)</div>
                                <div>{m.snapshot.high} / {m.snapshot.low}</div>
                            </div>
                        </div>

                        <!-- Dealing Rules -->
                        <div style="border-top: 1px solid #333; padding-top: 1rem;">
                            <h4 style="color: #666; margin-bottom: 0.75rem; font-size: 0.8rem; text-transform: uppercase;">Dealing Rules</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; font-size: 0.9rem;">
                                <div>
                                    <span style="color: #aaa;">Min Deal:</span>
                                    {m.dealingRules.minDealSize.value} {m.dealingRules.minDealSize.unit}
                                </div>
                                <div>
                                    <span style="color: #aaa;">Max Deal:</span>
                                    {m.dealingRules.maxDealSize.value}
                                </div>
                                <div>
                                    <span style="color: #aaa;">Step:</span>
                                    {m.dealingRules.minSizeIncrement.value}
                                </div>
                                <div>
                                    <span style="color: #aaa;">Min Stop Dist:</span>
                                    {m.dealingRules.minStopOrProfitDistance?.value ?? '-'}%
                                </div>
                                <div>
                                    <span style="color: #aaa;">Lot Size:</span>
                                    {m.instrument.lotSize}
                                </div>
                            </div>
                        </div>

                        <!-- Fees & Hours -->
                        <div style="border-top: 1px solid #333; padding-top: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">

                            <!-- Overnight Fees -->
                            <div>
                                <h4 style="color: #666; margin-bottom: 0.5rem; font-size: 0.8rem; text-transform: uppercase;">Overnight Fees</h4>
                                {#if m.instrument.overnightFee}
                                    <div style="font-size: 0.9rem;">
                                        <div style="display: flex; justify-content: space-between;">
                                            <span style="color: #aaa;">Long Rate:</span>
                                            <span>{m.instrument.overnightFee.longRate}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between;">
                                            <span style="color: #aaa;">Short Rate:</span>
                                            <span>{m.instrument.overnightFee.shortRate}</span>
                                        </div>
                                    </div>
                                {:else}
                                    <span style="color: #555; font-size: 0.9rem;">None</span>
                                {/if}
                            </div>

                            <!-- Schedule -->
                            <div>
                                <h4 style="color: #666; margin-bottom: 0.5rem; font-size: 0.8rem; text-transform: uppercase;">Schedule</h4>
                                <div style="font-size: 0.9rem;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="color: #aaa;">Zone:</span>
                                        <span>{m.instrument.openingHours.zone}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="color: #aaa;">Update:</span>
                                        <span>{new Date(m.snapshot.updateTime).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>