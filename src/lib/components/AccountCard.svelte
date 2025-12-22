<script lang="ts">
    import * as AUTH from '$lib/constants/auth.js';
    import type { Account } from '$lib/types/account.js';
    import type { URL_TYPE } from '$lib/types/url.js';

    let {
        account,
        mode,
        badgeText = undefined,
        // New Props for Interactivity
        href = undefined,
        isActive = false,
        actionLabel = undefined,
        onAction = undefined
    } = $props<{
        account: Account,
        mode: URL_TYPE,
        badgeText?: string,
        href?: string,
        isActive?: boolean,
        actionLabel?: string,
        onAction?: (e: Event) => void
    }>();

    // Determine container tag
    let tag = $derived(href ? 'a' : 'div');

    // Theme colors
    let isReal = $derived(mode === AUTH.REAL_TYPE);
    let themeColor = $derived(isReal ? '#26a69a' : '#ef5350');
</script>

<svelte:element
        this={tag}
        href={href}
        class="card"
        class:interactive={!!href}
        style="--theme-color: {themeColor};"
>
    <!-- Header Row -->
    <div class="header">
        <div class="title-group">
            <span class="name">{account.accountName}</span>
            <span class="currency">({account.currency})</span>
        </div>

        <div class="meta-group">
            {#if badgeText}
                <div class="badge">{badgeText}</div>
            {/if}

            {#if isActive}
                <span class="status-active">Trading</span>
            {/if}

            {#if onAction && actionLabel}
                <button
                        class="action-btn"
                        onclick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onAction(e);
                    }}
                >
                    {actionLabel}
                </button>
            {/if}
        </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid">
        <div>
            <div class="label">Balance</div>
            <div class="value">{account.symbol}{account.balance.balance.toFixed(2)}</div>
        </div>
        <div>
            <div class="label">Available</div>
            <div class="value">{account.symbol}{account.balance.available.toFixed(2)}</div>
        </div>
        <div>
            <div class="label">Deposit</div>
            <div class="value">{account.symbol}{account.balance.deposit.toFixed(2)}</div>
        </div>
        <div>
            <div class="label">P&L</div>
            <div class="value" style="color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                {account.balance.profitLoss.toFixed(2)}
            </div>
        </div>
    </div>
</svelte:element>

<style>
    .card {
        display: block;
        margin-bottom: 2rem;
        padding: 1.5rem;
        background: #262626; /* Default fallback */
        background: #1a1a1a;
        border-radius: 4px;
        border: 1px solid #333;
        border-left: 4px solid var(--theme-color);
        text-decoration: none;
        color: inherit;
        box-sizing: border-box;
    }

    /* Interactive State (Links) */
    .card.interactive {
        cursor: pointer;
        transition: border-color 0.2s;
    }
    .card.interactive:hover {
        border-top-color: #666;
        border-right-color: #666;
        border-bottom-color: #666;
    }

    .header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1rem;
        align-items: flex-start;
    }

    .title-group { display: flex; align-items: baseline; gap: 0.5rem; }
    .name { font-weight: bold; font-size: 1.1rem; color: #fff; }
    .currency { font-size: 0.8rem; color: #aaa; }

    .meta-group { display: flex; align-items: center; gap: 1rem; }

    .badge {
        font-size: 0.8rem;
        color: #aaa;
        background: #333;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .status-active {
        font-size: 0.8rem;
        color: var(--theme-color);
        font-weight: bold;
    }

    .action-btn {
        padding: 4px 8px;
        background: #333;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .action-btn:hover { background: #444; }

    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        font-size: 1rem;
    }
    .label { font-size: 0.8rem; color: #aaa; }
    .value { color: #fff; font-weight: bold; }
</style>