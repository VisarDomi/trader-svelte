<script lang="ts">
    import * as BACKEND from '$lib/constants/backend.js';
    let message = $state("Connecting to backend...");
    let time = $state<number | null>(null);
    $effect(() => {
        async function fetchData() {
            try {
                const res = await fetch(`${BACKEND.URL}${BACKEND.HELLO}`);
                const data = await res.json();
                message = data.message;
                time = data.time;
            } catch (err) {
                console.error(err);
                message = "Failed to connect to backend.";
            }
        }
        fetchData();
    });
</script>

<h1>Backend Health</h1>

<div style="border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 8px;">
    <p><strong>Message:</strong> {message}</p>
    {#if time}
        <p><strong>Server Time:</strong> {new Date(time).toLocaleString()}</p>
    {/if}
</div>

<p style="margin-top: 1rem;"><a href="/">← Back Home</a></p>