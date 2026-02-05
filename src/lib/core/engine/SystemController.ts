import { session } from '$lib/core/services/SessionManager.js';
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';

/**
 * The Mechanic.
 * Knows exactly which knobs to turn to wake up or shut down the machine.
 * Decouples the "What" (AppEngine State) from the "How" (Service Calls).
 */
export class SystemController {

    /**
     * Wakes up the trading environment.
     * Used when App becomes READY or recovers from FREEZE.
     */
    static wakeUp() {
        // 1. Start Polling Positions
        positionStore.startPolling();

        // 2. Start Risk Monitor
        riskService.start();

        // 3. Connect to Market Data Stream (if we have an active epic)
        if (session.lastEpic) {
            marketStore.connect(session.lastEpic);
        }

        // 4. Start the Watchdog to detect freezes
        watchdog.start();
    }

    /**
     * Puts the trading environment into low-power/safe mode.
     * Used when App goes BACKGROUND, OFFLINE, or before RECONNECTING.
     */
    static hibernate() {
        // 1. Stop polling to save bandwidth/resources
        positionStore.stopPolling();

        // 2. Stop Risk Monitor
        riskService.stop();

        // 3. Kill the stream connection to prevent "zombie" sockets
        marketStore.disconnect();

        // 4. Stop Watchdog (optional, but good for pure backgrounding)
        watchdog.stop();
    }
}