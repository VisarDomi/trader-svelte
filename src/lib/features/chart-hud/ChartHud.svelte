<script lang="ts">
    import { onDestroy } from 'svelte';
    import { ChartOverlay } from '$lib/features/chart-hud/ChartHudState.svelte.js';
    import { CHART_CONTAINER_ID } from '$lib/shared/constants/chart.js';
    import { bus } from '$lib/core/events/globalBus.js';
    import * as EVENTS from '$lib/shared/constants/events.js';

    let { overlay }: { overlay: ChartOverlay } = $props();

    function onTouchStart() {
        bus.emit(EVENTS.OVERLAY_BLOCK_CROSSHAIR, undefined as never);
    }

    function onTouchEnd() {
        bus.emit(EVENTS.OVERLAY_UNBLOCK_CROSSHAIR, undefined as never);
    }

    $effect(() => {
        if (!overlay.isClosingPosition) return;
        const chart = document.getElementById(CHART_CONTAINER_ID);
        if (chart) chart.style.pointerEvents = 'none';
        bus.emit(EVENTS.OVERLAY_BLOCK_CROSSHAIR, undefined as never);
        return () => {
            const c = document.getElementById(CHART_CONTAINER_ID);
            if (c) c.style.pointerEvents = '';
            bus.emit(EVENTS.OVERLAY_UNBLOCK_CROSSHAIR, undefined as never);
        };
    });

    onDestroy(() => {
        overlay.destroy();
    });
</script>

{#if overlay.debugText}
    <div class="debug-overlay">
        <span>{overlay.debugText}</span>
        <button class="debug-log-btn" onclick={() => overlay.logSnapshot()}>LOG</button>
    </div>
{/if}

{#if overlay.hasActiveAccount}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="overlay-container"
        ontouchstart={onTouchStart}
        ontouchend={onTouchEnd}
        ontouchcancel={onTouchEnd}
        onmousedown={onTouchStart}
        onmouseup={onTouchEnd}
    >
        <!-- The Toggle Arrow -->
        <button
                class="toggle-btn"
                onclick={() => overlay.toggle()}
                style="
                border-top-right-radius: {overlay.isOpen ? '0' : '8px'};
                border-bottom-right-radius: {overlay.isOpen ? '0' : '8px'};
                border-left: 4px solid {overlay.modeColor};
            "
        >
            <span class="arrow">{overlay.isOpen ? '◀' : '▶'}</span>
        </button>

        <!-- The Expanded Data Card -->
        {#if overlay.isOpen}
            <div class="data-card">
                <!-- 1. Market Name + Reset -->
                <div class="section market-section">
                    <div
                            role="button"
                            tabindex="0"
                            onclick={() => overlay.navToInstrument()}
                            onkeydown={(e) => e.key === 'Enter' && overlay.navToInstrument()}
                            class="clickable-area"
                    >
                        <div class="market-name">{overlay.marketName}</div>
                    </div>

                    <button onclick={() => overlay.resetChart()} class="reset-btn">
                        Reset Chart
                    </button>
                </div>

                <!-- 2. Account Info -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => overlay.navToAccounts()}
                        onkeydown={(e) => e.key === 'Enter' && overlay.navToAccounts()}
                        class="section account-section clickable-area"
                >
                    <div class="mode-label" style="color: {overlay.modeColor}">
                        {overlay.currentMode}
                    </div>
                    <div class="account-name">{overlay.accountName}</div>
                    <div class="balance">{overlay.accountBalanceDisplay}</div>
                </div>

                <!-- 3. Position Info (if active) -->
                {#if overlay.hasPosition}
                    <div
                            role="button"
                            tabindex="0"
                            onclick={() => overlay.navToPosition()}
                            onkeydown={(e) => e.key === 'Enter' && overlay.navToPosition()}
                            class="section position-section clickable-area"
                    >
                        <div class="pos-label">Position</div>
                        <div class="pos-value" style="color: {overlay.positionColor}">
                            {overlay.positionDirection}<br>
                            {overlay.positionSize}
                        </div>
                    </div>

                    <!-- 4. Close Position Button -->
                    <button
                        class="section close-position-btn"
                        onclick={() => overlay.closePosition()}
                        disabled={overlay.isClosingPosition}
                    >
                        {overlay.isClosingPosition ? '...' : 'X'}
                    </button>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .debug-overlay {
        position: fixed;
        bottom: 60px;
        left: 4px;
        z-index: 100;
        background: rgba(0, 0, 0, 0.85);
        color: #0f0;
        font-family: Monaco, monospace;
        font-size: 10px;
        padding: 4px 6px;
        border-radius: 4px;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .debug-log-btn {
        background: #333;
        color: #ff0;
        border: 1px solid #ff0;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 8px;
        border-radius: 3px;
        cursor: pointer;
    }
    .overlay-container {
        position: fixed;
        left: 0;
        top: env(safe-area-inset-top, 0px);
        z-index: 50;
        display: flex;
        align-items: stretch;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .toggle-btn {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-left: none;
        padding: 0 0.25rem;
        width: 2rem;
        color: #d1d4dc;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 4rem;
    }
    .arrow {
        font-size: 0.6rem;
    }

    .data-card {
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(4px);
        border: 1px solid #444;
        border-left: none;

        border-top-right-radius: 8px;
        border-bottom-right-radius: 8px;
        overflow: hidden;

        color: white;
        text-align: left;
        box-shadow: 4px 0 10px rgba(0,0,0,0.5);
        display: flex;
        align-items: stretch;
        max-width: 85vw;
    }

    .section {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .section:not(:last-child) {
        border-right: 1px solid #444;
    }

    .clickable-area {
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .market-section {
        min-width: 100px;
    }
    .market-name {
        font-size: 0.8rem;
        font-weight: bold;
        line-height: 1.1;
        word-wrap: break-word;
    }
    .reset-btn {
        background: transparent;
        border: none;
        border-top: 1px solid #444;
        color: #888;
        font-size: 0.7rem;
        padding: 4px;
        cursor: pointer;
        text-align: center;
        width: 100%;
    }

    .account-section {
        min-width: 90px;
        max-width: 140px;
    }
    .mode-label {
        font-size: 0.6rem;
        font-weight: 900;
        letter-spacing: 1px;
        margin-bottom: 2px;
    }
    .account-name {
        font-weight: bold;
        margin-bottom: 2px;
        color: #ccc;
        font-size: 0.7rem;
        line-height: 1;
        word-wrap: break-word;
    }
    .balance {
        font-weight: bold;
        font-size: 0.9rem;
        color: #fff;
    }

    .position-section {
        min-width: 60px;
    }
    .pos-label {
        font-weight: bold;
        margin-bottom: 0.1rem;
        color: #ddd;
        font-size: 0.65rem;
    }
    .pos-value {
        font-weight: bold;
        font-size: 0.85rem;
        line-height: 1.1;
    }

    .close-position-btn {
        background: rgba(239, 83, 80, 0.15);
        border: none;
        color: #ef5350;
        font-weight: 900;
        font-size: 0.8rem;
        padding: 0 0.5rem;
        cursor: pointer;
        min-width: 2.5rem;
    }
    .close-position-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
