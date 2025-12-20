import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';
import * as STORAGE from '$lib/constants/storage.js';

export class InstrumentLogic {
    instruments = Object.entries(TRADING.INSTRUMENT_DETAILS).map(([epic, details]) => ({
        epic,
        name: details.name
    }));

    select(epic: string) {
        if (typeof window !== 'undefined') {
            // This is the ONLY place where we write the epic to storage
            localStorage.setItem(STORAGE.LAST_EPIC_KEY, epic);
        }
        // Navigate cleanly without query parameters
        goto('/chart');
    }
}