<script lang="ts">
    import * as TRADING from '$lib/shared/constants/trading.js';
    import type { Direction } from '$lib/shared/types/trading.js';
    import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
    import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
    import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
    import { tradeManager } from '$lib/domains/trading/stores/TradeStore.svelte.js';
    import { preferencesStore } from '$lib/domains/trading/stores/PreferencesStore.svelte.js';
    import { LeverageService } from '$lib/domains/trading/domain/LeverageService.js';

    let { market }: { market: MarketDetailsResponse } = $props();

    const TARGET_PRESETS = [25, -25, 50, -50, 100, -100, 200, -200];

    let activeTarget: number | 'custom' | null = $state(null);
    let customValue = $state('');

    function currentPrice(): number {
        return marketStore.bid || 0;
    }

    function currentOffer(): number {
        return marketStore.offer || 0;
    }

    function handlePresetClick(pct: number) {
        activeTarget = pct;
        customValue = '';
    }

    function handleCustomClick() {
        activeTarget = 'custom';
        customValue = '';
    }

    function handleCustomInput(e: Event) {
        const target = e.target as HTMLInputElement;
        customValue = target.value;
    }

    function handleCustomSubmit() {
        const val = parseFloat(customValue);
        if (isNaN(val) || val === 0) return;
        activeTarget = val;
    }

    function getTargetPercent(): number | null {
        if (activeTarget === 'custom') {
            const val = parseFloat(customValue);
            return isNaN(val) ? null : val;
        }
        return activeTarget;
    }

    function getDirection(pct: number): Direction {
        return pct > 0 ? TRADING.BUY_DIRECTION : TRADING.SELL_DIRECTION;
    }

    function getTargetPrice(pct: number): number {
        const entry = pct > 0 ? currentOffer() : currentPrice();
        return entry * (1 + pct / 100);
    }

    function getEntryPrice(pct: number): number {
        return pct > 0 ? currentOffer() : currentPrice();
    }

    function handleAccept() {
        const pct = getTargetPercent();
        if (pct === null) return;

        const direction = getDirection(pct);
        const entryPrice = getEntryPrice(pct);
        const targetPrice = getTargetPrice(pct);
        const leverage = LeverageService.getEffectiveLeverage(market, preferencesStore.data);

        tradeManager.plan(entryPrice, targetPrice, direction, market, leverage);
        activeTarget = null;
    }

    function handleCancel() {
        activeTarget = null;
        customValue = '';
    }
</script>

<div class="target-bar">
    {#each TARGET_PRESETS as pct}
        {@const active = activeTarget === pct}
        {@const direction = getDirection(pct)}
        {@const entryPrice = getEntryPrice(pct)}
        {@const targetPrice = getTargetPrice(pct)}
        {@const dirColor = pct > 0 ? '#26a69a' : '#ef5350'}

        <div class="btn-wrapper">
            <button
                class="target-btn"
                style="border-color: {dirColor}; {active ? 'background: ' + dirColor : ''}"
                onclick={() => handlePresetClick(pct)}
            >
                {pct > 0 ? '+' : ''}{pct}%
            </button>

            {#if active}
                <div class="modal-under" style="border-color: {dirColor}">
                    <div class="modal-info">
                        <span style="color: {dirColor}; font-weight: bold;">
                            {direction === 'BUY' ? 'BUY ↑' : 'SELL ↓'}
                        </span>
                        <span>Entry: {entryPrice.toFixed(1)}</span>
                        <span>Target: {targetPrice.toFixed(1)}</span>
                        <span style="color: {dirColor};">
                            {direction === 'BUY' ? '+' : ''}{pct}%
                        </span>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-cancel" onclick={handleCancel}>Cancel</button>
                        <button class="modal-accept" style="background: {dirColor};" onclick={handleAccept}>
                            Accept
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/each}

    <div class="btn-wrapper">
        <button
            class="target-btn"
            class:active={activeTarget === 'custom'}
            onclick={handleCustomClick}
        >
            Custom
        </button>

        {#if activeTarget === 'custom'}
            <div class="modal-under custom-modal">
                <div class="modal-info">
                    <input
                        type="number"
                        placeholder="Enter % (e.g. 150)"
                        value={customValue}
                        oninput={handleCustomInput}
                        onkeydown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                        class="custom-input"
                        autofocus
                    />
                    <div class="hint">
                        Positive = BUY, Negative = SELL
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-cancel" onclick={handleCancel}>Cancel</button>
                    <button
                        class="modal-accept"
                        style="background: #888;"
                        onclick={handleCustomSubmit}
                        disabled={!customValue}
                    >
                        Preview
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .target-bar {
        display: flex;
        gap: 4px;
        padding: 4px 8px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }

    .btn-wrapper {
        position: relative;
        flex-shrink: 0;
    }

    .target-btn {
        padding: 6px 12px;
        border: 1px solid #444;
        background: transparent;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: bold;
        white-space: nowrap;
        transition: all 0.15s;
    }

    .target-btn:hover {
        border-color: #666;
    }

    .target-btn.active {
        color: white;
    }

    .modal-under {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: 4px;
        background: rgba(20, 20, 20, 0.97);
        border: 1px solid;
        border-radius: 6px;
        padding: 8px 12px;
        z-index: 50;
        min-width: 180px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }

    .modal-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8rem;
        color: #ccc;
        margin-bottom: 8px;
    }

    .modal-actions {
        display: flex;
        gap: 8px;
        justify-content: center;
    }

    .modal-cancel, .modal-accept {
        padding: 6px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: bold;
        color: white;
    }

    .modal-cancel {
        background: transparent;
        border: 1px solid #666;
        color: #ccc;
    }

    .custom-input {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #555;
        background: #111;
        color: white;
        border-radius: 4px;
        font-size: 1rem;
        box-sizing: border-box;
    }

    .hint {
        font-size: 0.7rem;
        color: #888;
    }
</style>
