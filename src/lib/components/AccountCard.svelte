<script lang="ts">
    import * as AUTH from '$lib/constants/auth.js';
    import type { Account } from '$lib/types/account.js';
    import type { URL_TYPE } from '$lib/types/url.js';

    let { account, mode, badgeText } = $props<{
        account: Account,
        mode: URL_TYPE,
        badgeText?: string
    }>();
</script>

<div style="
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #262626;
    border-radius: 4px;
    border-left: 4px solid {mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
">
    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
        <div>
            <span style="font-weight: bold; font-size: 1.1rem; color: #fff;">{account.accountName}</span>
            <span style="font-size: 0.8rem; color: #aaa; margin-left: 0.5rem;">({account.currency})</span>
        </div>
        {#if badgeText}
            <div style="font-size: 0.8rem; color: #aaa; background: #333; padding: 2px 6px; border-radius: 4px;">
                {badgeText}
            </div>
        {/if}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; font-size: 1rem;">
        <div>
            <div style="font-size: 0.8rem; color: #aaa;">Balance</div>
            <div style="color: #fff; font-weight: bold;">{account.balance.balance.toFixed(2)}</div>
        </div>
        <div>
            <div style="font-size: 0.8rem; color: #aaa;">Available</div>
            <div style="color: #fff; font-weight: bold;">{account.balance.available.toFixed(2)}</div>
        </div>
        <div>
            <div style="font-size: 0.8rem; color: #aaa;">Deposit</div>
            <div style="color: #fff; font-weight: bold;">{account.balance.deposit.toFixed(2)}</div>
        </div>
        <div>
            <div style="font-size: 0.8rem; color: #aaa;">P&L</div>
            <div style="font-weight: bold; color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                {account.balance.profitLoss.toFixed(2)}
            </div>
        </div>
    </div>
</div>