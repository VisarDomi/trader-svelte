<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { authStore } from '$lib/domains/auth/stores/AuthStore.svelte.js';
    import { appEngine } from '$lib/core/engine/AppEngine.svelte.js';
    import { isShowcaseProfile } from '$lib/core/config/runtime.js';

    const showcase = isShowcaseProfile();

    onMount(() => {
        authStore.init();
        if (showcase) {
            void handleShowcaseLogin();
        }
    });

    async function handleLogin() {
        await authStore.loginBoth();

        if (authStore.realTokens && authStore.demoTokens) {

            await appEngine.boot();
            void goto('/chart');
        }
    }

    async function handleShowcaseLogin() {
        await authStore.loginShowcase();

        if (authStore.demoTokens) {
            await appEngine.boot();
            void goto('/chart');
        }
    }
</script>

<div class="login-shell">
    <div class="login-stage">
        <div class="hero">
            <div class="eyebrow">{showcase ? 'SHOWCASE PROFILE' : 'PERSONAL PROFILE'}</div>
            <h1>Moon Tendies</h1>
            <p class="lead">
                {#if showcase}
                    Private demo route with server-owned demo auth and the same chart/runtime behavior used in the main app.
                {:else}
                    Real-time trading PWA tuned for mobile Safari, background resume, and chart interaction on iPhone.
                {/if}
            </p>
        </div>

        <section class="panel auth-panel">
            <div class="panel-header">
                <div>
                    <h2>{showcase ? 'Enter Showcase' : 'Sign In'}</h2>
                    <p class="panel-subtitle">
                        {showcase ? 'Server-owned demo session' : 'Capital.com credentials'}
                    </p>
                </div>
            </div>

            {#if showcase}
                <p class="copy">
                    Showcase mode keeps raw credentials on the server and opens a demo session for this browser.
                </p>
                <button onclick={handleShowcaseLogin} class="primary demo">
                    ENTER SHOWCASE
                </button>
            {:else}
                <p class="copy">
                    Sign in with your Capital.com credentials to enter the app. Tendies keeps demo selected by default for trading.
                </p>

                <label class="field">
                    <span>API Key</span>
                    <input type="text" bind:value={authStore.apiKey} placeholder="X-CAP-API-KEY" />
                </label>
                <label class="field">
                    <span>Identifier</span>
                    <input type="text" bind:value={authStore.identifier} placeholder="user@example.com" />
                </label>
                <label class="field">
                    <span>Password</span>
                    <input type="password" bind:value={authStore.password} placeholder="password" />
                </label>

                <button onclick={handleLogin} class="primary real">
                    SIGN IN
                </button>
            {/if}
        </section>
    </div>
</div>

<style>
    .login-shell {
        min-height: 100vh;
        padding: max(1.25rem, env(safe-area-inset-top, 0px)) 1rem max(1.5rem, env(safe-area-inset-bottom, 0px));
        display: flex;
        align-items: center;
        justify-content: center;
        background:
            radial-gradient(circle at top left, rgba(239, 83, 80, 0.18), transparent 28rem),
            radial-gradient(circle at top right, rgba(38, 166, 154, 0.16), transparent 30rem),
            linear-gradient(180deg, #050505 0%, #0b0b0b 100%);
    }

    .login-stage {
        width: min(100%, 1080px);
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px);
        gap: 2.5rem;
        align-items: center;
    }

    .eyebrow {
        color: #888;
        font-size: 0.72rem;
        letter-spacing: 0.18em;
        font-weight: 700;
        margin-bottom: 0.5rem;
    }

    .hero {
        max-width: 38rem;
    }

    h1 {
        font-size: clamp(2rem, 7vw, 3.5rem);
        line-height: 0.95;
        margin-bottom: 0.75rem;
    }

    .lead {
        color: #a3a3a3;
        max-width: 34rem;
        font-size: 0.95rem;
    }

    .panel {
        background: rgba(26, 26, 26, 0.92);
        border: 1px solid #333;
        border-radius: 16px;
        padding: 1.25rem;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(8px);
    }

    .auth-panel {
        width: 100%;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    h2 {
        font-size: 1.1rem;
    }

    .panel-subtitle {
        color: #8a8a8a;
        font-size: 0.84rem;
        margin-top: 0.15rem;
    }

    .copy {
        color: #8d8d8d;
        margin-bottom: 1rem;
        max-width: 32rem;
        font-size: 0.92rem;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.85rem;
    }

    .field span {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8d8d8d;
        font-weight: 700;
    }

    .field input {
        width: 100%;
        padding: 0.9rem 0.95rem;
        background: #111;
        color: #fff;
        border: 1px solid #2f2f2f;
        border-radius: 10px;
        font-size: 1rem;
        min-width: 0;
    }

    .field input:focus {
        outline: none;
        border-color: #555;
    }

    .primary {
        border: none;
        cursor: pointer;
        font-weight: 800;
        border-radius: 10px;
        transition: transform 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
    }

    .primary {
        width: 100%;
        padding: 1rem 1.1rem;
        color: white;
        margin-top: 0.5rem;
    }

    .primary.real {
        background: #26a69a;
    }

    .primary.demo {
        background: #ef5350;
    }

    .primary:hover {
        transform: translateY(-1px);
    }

    @media (max-width: 860px) {
        .login-stage {
            grid-template-columns: 1fr;
            gap: 1.5rem;
        }

        .auth-panel {
            max-width: 100%;
        }
    }

    @media (max-width: 520px) {
        .login-shell {
            align-items: stretch;
            justify-content: flex-start;
        }

        .login-stage {
            width: 100%;
        }

        .panel {
            padding: 1rem;
            border-radius: 14px;
        }

        .panel-header {
            align-items: flex-start;
            flex-direction: column;
        }
    }
</style>
