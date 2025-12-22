<script lang="ts">
    import { onDestroy } from 'svelte';
    import { ChartOverlay } from './overlay.svelte.js';

    let { overlay }: { overlay: ChartOverlay } = $props();

    onDestroy(() => {
        overlay.destroy();
    });
</script>

{#if overlay.hasActiveAccount}
    <div style="
        position: fixed;
        left: 0;
        top: 1%;
        z-index: 50;
        display: flex;
        align-items: stretch;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
        <!-- The Toggle Arrow -->
        <button
                onclick={() => overlay.toggle()}
                style="
                background: rgba(30, 30, 30, 0.95);
                border: 1px solid #444;
                border-left: none;
                border-top-right-radius: {overlay.isOpen ? '0' : '8px'};
                border-bottom-right-radius: {overlay.isOpen ? '0' : '8px'};
                padding: 0 0.25rem;
                width: 2rem;
                color: #d1d4dc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 4rem;
                border-left: 4px solid {overlay.modeColor};
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.6rem;">◀</span>
            {:else}
                <span style="font-size: 0.6rem;">▶</span>
            {/if}
        </button>

        <!-- The Expanded Data Card -->
        {#if overlay.isOpen}
            <div
                    style="
                    background: rgba(20, 20, 20, 0.95);
                    backdrop-filter: blur(4px);
                    border: 1px solid #444;
                    border-left: none;
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                    color: white;
                    text-align: left;
                    box-shadow: 4px 0 10px rgba(0,0,0,0.5);
                    display: flex;
                    align-items: stretch;
                    max-width: 85vw;
                "
            >
                <!-- 1. Market Name -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => overlay.navToInstrument()}
                        onkeydown={(e) => e.key === 'Enter' && overlay.navToInstrument()}
                        style="
                        padding: 0.25rem 0.5rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        border-right: 1px solid #444;
                        max-width: 100px;
                    "
                >
                    <div style="font-size: 0.8rem; font-weight: bold; line-height: 1.1; word-wrap: break-word;">
                        {overlay.marketName}
                    </div>
                </div>

                <!-- 2. Account Info -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => overlay.navToAccounts()}
                        onkeydown={(e) => e.key === 'Enter' && overlay.navToAccounts()}
                        style="
                        padding: 0.25rem 0.5rem;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        border-right: 1px solid #444;
                        min-width: 90px;
                        max-width: 140px;
                    "
                >
                    <div style="
                        font-size: 0.6rem;
                        font-weight: 900;
                        letter-spacing: 1px;
                        color: {overlay.modeColor};
                        margin-bottom: 2px;
                    ">
                        {overlay.currentMode}
                    </div>
                    <div style="
                        font-weight: bold;
                        margin-bottom: 2px;
                        color: #ccc;
                        font-size: 0.7rem;
                        line-height: 1;
                        word-wrap: break-word;
                    ">
                        {overlay.accountName}
                    </div>
                    <div style="font-weight: bold; font-size: 0.9rem; color: #fff;">
                        {overlay.accountBalanceDisplay}
                    </div>
                </div>

                <!-- 3. Position Info / Close Button -->
                {#if overlay.hasPosition}
                    <div
                            role="button"
                            tabindex="0"
                            onclick={() => overlay.navToPosition()}
                            onkeydown={(e) => e.key === 'Enter' && overlay.navToPosition()}
                            style="
                            padding: 0.25rem 0.5rem;
                            cursor: pointer;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            border-right: 1px solid #444;
                            min-width: 60px;
                        "
                    >
                        <div style="font-weight: bold; margin-bottom: 0.1rem; color: #ddd; font-size: 0.65rem;">
                            Position
                        </div>
                        <div style="
                            font-weight: bold;
                            font-size: 0.85rem;
                            line-height: 1.1;
                            color: {overlay.positionColor}
                        ">
                            {overlay.positionDirection}<br>
                            {overlay.positionSize}
                        </div>
                    </div>

                    <button
                            onclick={() => overlay.closePosition()}
                            disabled={overlay.isClosing}
                            style="
                            background: {overlay.closeButtonColor};
                            border: none;
                            color: white;
                            padding: 0 0.5rem;
                            cursor: pointer;
                            font-weight: bold;
                            border-top-right-radius: 8px;
                            border-bottom-right-radius: 8px;
                            font-size: 0.8rem;
                            width: 60px;
                            line-height: 1.1;
                            white-space: normal;
                        "
                    >
                        {overlay.closeButtonText}
                    </button>
                {/if}
            </div>
        {/if}
    </div>
{/if}