<script lang="ts">
    import { onDestroy } from 'svelte';
    import { ChartOverlay } from '../core/ChartOverlay.svelte.js';
    import { shield } from '$lib/modules/chart/actions/shield.js';

    let { overlay }: { overlay: ChartOverlay } = $props();

    onDestroy(() => {
        overlay.destroy();
    });
</script>

{#if overlay.hasActiveAccount}
    <div class="overlay-container">
        <!-- The Toggle Arrow -->
        <button
                class="toggle-btn"
                onclick={() => overlay.toggle()}
                use:shield
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
                            use:shield
                            class="clickable-area"
                    >
                        <div class="market-name">{overlay.marketName}</div>
                    </div>

                    <button onclick={() => overlay.resetChart()} use:shield class="reset-btn">
                        Reset Chart
                    </button>
                </div>

                <!-- 2. Account Info -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => overlay.navToAccounts()}
                        onkeydown={(e) => e.key === 'Enter' && overlay.navToAccounts()}
                        use:shield
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
                            use:shield
                            class="section position-section clickable-area"
                    >
                        <div class="pos-label">Position</div>
                        <div class="pos-value" style="color: {overlay.positionColor}">
                            {overlay.positionDirection}<br>
                            {overlay.positionSize}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .overlay-container {
        position: fixed;
        left: 0;
        top: 1%;
        z-index: 50;
        display: flex;
        align-items: stretch;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Toggle Button */
    .toggle-btn {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-left: none; /* Handled by inline style for color */
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

    /* Data Card Container */
    .data-card {
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(4px);
        border: 1px solid #444;
        border-left: none;

        /* Auto-rounded corners handling:
           Overflow hidden ensures children don't bleed out,
           so we don't need to manually radius the last child. */
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

    /* Sections */
    .section {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    /* Automatic Separators */
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

    /* Market Section */
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

    /* Account Section */
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

    /* Position Section */
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
</style>