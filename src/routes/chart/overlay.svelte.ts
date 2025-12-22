import { positionStore } from '$lib/stores/position.svelte.js';
import { getMarketDetails } from '$lib/services/market.js';
import { api } from '$lib/services/api.svelte.js';

export class ChartOverlay {
    isOpen = $state(false);
    marketName = $state('');

    // Kept for compatibility with ChartLogic, but mostly just gets the name now
    async init(epic: string, _unusedCallback?: any) {
        // We fetch the name purely for the UI label
        const client = api.client;
        if (client) {
            try {
                const md = await getMarketDetails(client, epic);
                this.marketName = md.instrument.name;
            } catch {
                this.marketName = epic;
            }
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }

    destroy() {
        // No cleanup needed anymore
    }

    // Proxy methods for the UI to call
    async closePosition() {
        await positionStore.close();
    }
}