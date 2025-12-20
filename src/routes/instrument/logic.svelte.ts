import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';

export class InstrumentLogic {
    instruments = [
        { epic: TRADING.NDX_EPIC, name: 'US Tech 100' },
        { epic: TRADING.BTCUSD_EPIC, name: 'Bitcoin / USD' }
    ];

    select(epic: string) {
        goto(`/chart?epic=${epic}`);
    }
}