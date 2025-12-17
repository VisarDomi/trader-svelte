<script lang="ts">
    import { onMount } from 'svelte';
    import { CREDENTIALS_KEY } from '$lib/constants/storage.js';
    import type {AuthTokens, Credentials} from "$lib/types/auth";
    import type { URL_TYPE } from "$lib/types/url";
    import { login } from "$lib/services/auth";
    import {DEMO_TYPE, REAL_TYPE} from "$lib/constants/auth";

    let apiKey = $state("");
    let identifier = $state("");
    let password = $state("");

    let loginStatus = $state("Ready to login");
    let tokens = $state<AuthTokens | null>(null);

    // Load credentials from LocalStorage on mount
    onMount(() => {
        const stored = localStorage.getItem(CREDENTIALS_KEY);
        if (stored) {
            const creds = JSON.parse(stored);
            apiKey = creds.apiKey || "";
            identifier = creds.identifier || "";
            password = creds.password || "";
            loginStatus = "Credentials loaded from storage.";
        }
    });

    function saveCredentials() {
        const credentials: Credentials = {
            apiKey,
            identifier,
            password
        };
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
    }

    async function handleLogin(type: URL_TYPE) {
        saveCredentials();

        try {
            loginStatus = `Logging into ${type}...`;
            tokens = await login(type);
            loginStatus = `Success: Logged into ${type}`;
        } catch (e) {
            console.error(e);
            loginStatus = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
</script>

<h1>Authentication</h1>

<div style="max-width: 400px; display: flex; flex-direction: column; gap: 0.5rem;">
    <label>
        API Key
        <input type="text" bind:value={apiKey} placeholder="the apikey" style="width: 100%; padding: 8px;" />
    </label>
    <label>
        Identifier (User/Login ID/email)
        <input type="text" bind:value={identifier} placeholder="e.g. user@example.com" style="width: 100%; padding: 8px;" />
    </label>

    <label>
        Password
        <input type="password" bind:value={password} placeholder="password of the key" style="width: 100%; padding: 8px;" />
    </label>

</div>

<div style="border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 8px;">
    <p>Status: <strong>{loginStatus}</strong></p>

    <div style="margin-top: 1rem; display: flex; gap: 1rem;">
        <!-- These buttons now save credentials implicitly before logging in -->
        <button onclick={() => handleLogin(DEMO_TYPE)}>Login DEMO</button>
        <button onclick={() => handleLogin(REAL_TYPE)}>Login REAL</button>
    </div>

    {#if tokens}
        <div style="margin-top: 1rem; background: #eee; padding: 1rem; border-radius: 4px; overflow-x: auto;">
            <h3>Received Tokens:</h3>
            <pre>{JSON.stringify(tokens, null, 2)}</pre>
        </div>
    {/if}
</div>

<p style="margin-top: 1rem;"><a href="/">← Back Home</a></p>