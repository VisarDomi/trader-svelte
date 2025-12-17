<script lang="ts">
    import { onMount } from 'svelte';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as AUTH_CONST from '$lib/constants/auth.js';
    import type { SessionTokens, UserCredentials } from "$lib/types/auth";
    import type { URL_TYPE } from "$lib/types/url";
    import { login } from "$lib/services/auth";

    // 1. Single source of truth for Inputs
    let identifier = $state("");
    let password = $state("");
    let apiKey = $state("");

    // 2. Separate states for outputs
    let demoStatus = $state("Not Logged In");
    let realStatus = $state("Not Logged In");
    let demoTokens = $state<SessionTokens | null>(null);
    let realTokens = $state<SessionTokens | null>(null);

    onMount(() => {
        const storedCredentials = localStorage.getItem(STORAGE.USER_CREDENTIALS_KEY);
        if (storedCredentials) {
            const c = JSON.parse(storedCredentials) as UserCredentials;
            identifier = c.identifier;
            password = c.password;
            apiKey = c.apiKey;
        }

        const demoTokensData = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);
        if (demoTokensData) demoTokens = JSON.parse(demoTokensData);

        const realTokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (realTokensData) realTokens = JSON.parse(realTokensData);
    });

    function saveInputs() {
        const credentials: UserCredentials = { identifier, password, apiKey };
        localStorage.setItem(STORAGE.USER_CREDENTIALS_KEY, JSON.stringify(credentials));
    }

    async function performLogin(type: URL_TYPE) {
        saveInputs();

        try {
            if (type === AUTH_CONST.DEMO_TYPE) {
                demoStatus = "Logging in...";
                const t = await login(type);
                localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(t));
                demoTokens = t;
                demoStatus = "Connected";
            } else {
                realStatus = "Logging in...";
                const t = await login(type);
                localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(t));
                realTokens = t;
                realStatus = "Connected";
            }
        } catch (e) {
            const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
            if (type === AUTH_CONST.DEMO_TYPE) demoStatus = msg;
            else realStatus = msg;
            console.error(e);
        }
    }

    async function loginBoth() {
        await Promise.all([
            performLogin(AUTH_CONST.REAL_TYPE),
            performLogin(AUTH_CONST.DEMO_TYPE)
        ]);
    }
</script>

<h1>Authentication</h1>

<div style="max-width: 400px; display: flex; flex-direction: column; gap: 0.5rem;">
    <p style="font-size: 0.8rem; color: #666;">
        Enter your credentials once. These will be used to authenticate against both Real (for charts) and Demo (for trading).
    </p>

    <label>
        API Key
        <input type="text" bind:value={apiKey} placeholder="X-CAP-API-KEY" style="width: 100%; padding: 8px;" />
    </label>
    <label>
        Identifier
        <input type="text" bind:value={identifier} placeholder="user@example.com" style="width: 100%; padding: 8px;" />
    </label>
    <label>
        Password
        <input type="password" bind:value={password} placeholder="password" style="width: 100%; padding: 8px;" />
    </label>

    <button onclick={loginBoth} style="padding: 1rem; background-color: #26a69a; color: white; border: none; font-weight: bold; cursor: pointer;">
        LOGIN TO BOTH
    </button>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 2rem;">
    <!-- REAL STATUS -->
    <div style="border: 1px solid #26a69a; padding: 1rem; border-radius: 8px;">
        <h3>REAL (Charts)</h3>
        <p>Status: <strong>{realStatus}</strong></p>
        <button onclick={() => performLogin(AUTH_CONST.REAL_TYPE)}>Retry Real</button>
        {#if realTokens}<div style="font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; color: green;">Token: {realTokens.cst.substring(0,10)}...</div>{/if}
    </div>

    <!-- DEMO STATUS -->
    <div style="border: 1px solid #ef5350; padding: 1rem; border-radius: 8px;">
        <h3>DEMO (Trading)</h3>
        <p>Status: <strong>{demoStatus}</strong></p>
        <button onclick={() => performLogin(AUTH_CONST.DEMO_TYPE)}>Retry Demo</button>
        {#if demoTokens}<div style="font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; color: green;">Token: {demoTokens.cst.substring(0,10)}...</div>{/if}
    </div>
</div>

<p style="margin-top: 1rem;"><a href="/">← Back Home</a></p>