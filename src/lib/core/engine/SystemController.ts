import { session } from '$lib/core/services/SessionManager.js';
import { watchdog } from '$lib/core/services/WatchdogService.svelte.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';

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
     * Switch Context (Epic Change)
     */
    static switchContext(newEpic: string) {
        // 1. Hibernate current processes
        this.hibernate();

        // 2. Reconfigure Services
        positionPoller.setEpic(newEpic);

        // 3. Wake up (Connects MarketPump to new epic automatically via logic in connect())
        // Note: We need to explicitly pass the new epic to connect if we want it to switch
        marketDataPump.connect(newEpic);

        // (Wait, SystemController.wakeUp uses session.lastEpic.
        // We should assume session.lastEpic was updated BEFORE calling switchContext,
        // or update it here. For safety, wakeUp() checks session.)
        this.wakeUp();
    }
}