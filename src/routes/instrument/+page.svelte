<script lang="ts">
    import { InstrumentLogic } from './logic.svelte.js';
    const logic = new InstrumentLogic();
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Select Instrument</h1>
        <a href="/chart" style="color: #d1d4dc;">← Back</a>
    </div>

    <div style="display: grid; gap: 1rem;">
        {#each logic.instruments as inst}
            <button
                    onclick={() => logic.select(inst.epic)}
                    style="
                    display: block;
                    width: 100%;
                    text-decoration: none;
                    color: inherit;
                    background: #1a1a1a;
                    padding: 1.5rem;
                    border-radius: 8px;
                    border: 1px solid #333;
                    text-align: left;
                    cursor: pointer;
                    font-size: 1.2rem;
                    font-weight: bold;
                "
            >
                {inst.name}
                <span style="display: block; font-size: 0.8rem; color: #666; margin-top: 0.5rem;">
                    {inst.epic}
                </span>
            </button>
        {/each}
    </div>
</div>