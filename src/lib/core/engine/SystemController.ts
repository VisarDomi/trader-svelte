import { session } from '$lib/core/services/SessionManager.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { marketCmd } from '$lib/domains/market/stores/MarketCommands.js';
import { bus } from '$lib/core/events/globalBus.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { log } from '$lib/shared/utils/log.js';

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
        log.info('[SystemController] Waking up...');

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
    }

    /**
     * Puts the trading environment into low-power/safe mode.
     * Used when App goes BACKGROUND, OFFLINE, or before RECONNECTING.
     */
    static hibernate() {
        log.info('[SystemController] Hibernating...');

        // 1. Stop polling to save bandwidth/resources
        positionPoller.stop();

        // 2. Stop Risk Monitor
        riskService.stop();

        // 3. Kill the stream connection to prevent "zombie" sockets
        marketDataPump.disconnect();
    }

    /**
     * Switch Instrument Context
     * Tears down everything, updates session, resets stores, and restarts.
     */
    static switchContext(newEpic: string) {
        if (session.lastEpic === newEpic && marketStore.isLoaded) return;

        log.info(`[SystemController] Switching Context to ${newEpic}`);

        // 1. Stop everything immediately
        this.hibernate();

        // 2. Update Persistent Session
        session.lastEpic = newEpic;

        // 3. Reset Market Store (Clear old data to prevent flash of wrong chart)
        marketStore.dispatch(marketCmd.reset(TRADING.CHART_DATA_SOURCE_BID));

        // 4. Restart services
        this.wakeUp();

        // 5. Notify UI Layer (ChartLogic) to reload metadata/precision
        bus.emit(EVENTS.MARKET_SELECTED, { epic: newEpic });
    }

    /**
     * Restart System
     * Used when switching Accounts or recovering from deep sleep.
     */
    static restart() {
        log.info('[SystemController] Restarting system...');
        this.hibernate();
        // Determine current epic from session and re-apply
        if (session.lastEpic) {
            positionPoller.setEpic(session.lastEpic);
        }
        this.wakeUp();
    }
}