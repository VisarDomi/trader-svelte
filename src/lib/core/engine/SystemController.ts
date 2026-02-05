import { session } from '$lib/core/services/SessionManager.js';
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import * as TRADING from '$lib/shared/constants/trading.js';

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
        console.log('[SystemController] Waking up...');

        // 1. Start Polling Positions
        if (session.lastEpic) {
            positionPoller.setEpic(session.lastEpic);
        }
        positionPoller.start();

        // 2. Start Risk Monitor
        riskService.start();

        // 3. Connect to Market Data Stream (if we have an active epic)
        if (session.lastEpic) {
            marketDataPump.connect(session.lastEpic);
        }

        // 4. Start the Watchdog to detect freezes
        watchdog.start();
    }

    /**
     * Puts the trading environment into low-power/safe mode.
     * Used when App goes BACKGROUND, OFFLINE, or before RECONNECTING.
     */
    static hibernate() {
        console.log('[SystemController] Hibernating...');

        // 1. Stop polling to save bandwidth/resources
        positionPoller.stop();

        // 2. Stop Risk Monitor
        riskService.stop();

        // 3. Kill the stream connection to prevent "zombie" sockets
        marketDataPump.disconnect();

        // 4. Stop Watchdog (optional, but good for pure backgrounding)
        watchdog.stop();
    }

    /**
     * Switch Instrument Context
     * Tears down everything, updates session, resets stores, and restarts.
     */
    static switchContext(newEpic: string) {
        if (session.lastEpic === newEpic && marketStore.isLoaded) return;

        console.log(`[SystemController] Switching Context to ${newEpic}`);

        // 1. Stop everything immediately
        this.hibernate();

        // 2. Update Persistent Session
        session.lastEpic = newEpic;

        // 3. Reset Market Store (Clear old data to prevent flash of wrong chart)
        // We default to BID until ChartLogic determines direction
        marketStore.reset(TRADING.CHART_DATA_SOURCE_BID);

        // 4. Reconfigure Poller
        positionPoller.setEpic(newEpic);

        // 5. Restart
        this.wakeUp();
    }

    /**
     * Restart System
     * Used when switching Accounts or recovering from deep sleep.
     */
    static restart() {
        console.log('[SystemController] Restarting system...');
        this.hibernate();
        // Determine current epic from session and re-apply
        if (session.lastEpic) {
            positionPoller.setEpic(session.lastEpic);
        }
        this.wakeUp();
    }
}