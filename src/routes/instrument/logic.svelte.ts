import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';

export class InstrumentLogic {
    // Refactored: Derive list from the central config
    instruments = Object.entries(TRADING.INSTRUMENT_DETAILS).map(([epic, details]) => ({
        epic,
        name: details.name
    }));

    select(epic: string) {
        goto(`/chart?epic=${epic}`);
    }
}