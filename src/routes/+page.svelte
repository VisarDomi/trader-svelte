<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import * as AUTH_CONST from '$lib/constants/auth.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import { login } from "$lib/services/auth";
    import { getCredentials } from "$lib/services/credentials";

    let status = $state("Initializing...");

    onMount(async () => {
        try {
            // Check if credentials exist in storage first
            getCredentials();

            status = "Authenticating...";

            // Parallel login to both environments
            const [realTokens, demoTokens] = await Promise.all([
                login(AUTH_CONST.REAL_TYPE),
                login(AUTH_CONST.DEMO_TYPE)
            ]);

            // Store tokens
            localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(realTokens));
            localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(demoTokens));

            // Forward to chart
            await goto(`/chart?epic=${TRADING.BTCUSD_EPIC}`);

        } catch (error) {
            console.error(error);
            await goto('/login');
        }
    });
</script>

<div style="height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column;">
    <h1>Trader Svelte</h1>
    <p>{status}</p>
</div>