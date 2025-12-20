<script lang="ts">
    import { onMount } from 'svelte';
    import { InstrumentLogic } from './logic.svelte.js';
    const logic = new InstrumentLogic();

    onMount(() => {
        logic.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Select Instrument</h1>
        <a href="/chart" style="color: #d1d4dc;">← Back</a>
    </div>

    {#if logic.isLoading}
        <p>Fetching market details...</p>
    {:else if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px;">
            {logic.error}
        </div>
    {:else}
        <div style="display: grid; gap: 1rem;">
            {#each logic.instruments as market}
                <button
                        onclick={() => logic.select(market.instrument.epic)}
                        style="
                        display: block;
                        width: 100%;
                        text-decoration: none;
                        color: inherit;
                        background: #1a1a1a;
                        padding: 1.5rem;
                        border-radius: 8px;
                        border: 1px solid #333;
                        text-align: left;
                        cursor: pointer;
                        transition: background 0.2s;
                    "
                        onmouseover={(e) => e.currentTarget.style.background = '#262626'}
                        onmouseout={(e) => e.currentTarget.style.background = '#1a1a1a'}
                        onfocus={(e) => e.currentTarget.style.background = '#262626'}
                        onblur={(e) => e.currentTarget.style.background = '#1a1a1a'}
                >
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div>
                            <div style="font-size: 1.3rem; font-weight: bold; color: white;">
                                {market.instrument.name}
                            </div>
                            <div style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">
                                {market.instrument.epic} | {market.instrument.type}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: bold; color: {market.snapshot.marketStatus === 'TRADEABLE' ? '#26a69a' : '#ef5350'}">
                                {market.snapshot.marketStatus}
                            </div>
                            <div style="font-size: 0.8rem; color: #888;">
                                Lev: {logic.getLeverage(market)}
                            </div>
                        </div>
                    </div>

                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 1rem;
                        font-size: 0.85rem;
                        background: #222;
                        padding: 1rem;
                        border-radius: 4px;
                    ">
                        <div>
                            <div style="color: #888; margin-bottom: 0.25rem;">Bid</div>
                            <div style="font-weight: bold;">{market.snapshot.bid.toFixed(market.snapshot.decimalPlacesFactor)}</div>
                        </div>
                        <div>
                            <div style="color: #888; margin-bottom: 0.25rem;">Offer</div>
                            <div style="font-weight: bold;">{market.snapshot.offer.toFixed(market.snapshot.decimalPlacesFactor)}</div>
                        </div>
                        <div>
                            <div style="color: #888; margin-bottom: 0.25rem;">Min Size</div>
                            <div style="font-weight: bold;">{market.dealingRules.minDealSize.value}</div>
                        </div>
                        <div>
                            <div style="color: #888; margin-bottom: 0.25rem;">Precision</div>
                            <div style="font-weight: bold;">{market.snapshot.decimalPlacesFactor}</div>
                        </div>
                    </div>
                </button>
            {/each}
        </div>
    {/if}
</div>