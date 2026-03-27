import { session } from '$lib/core/services/SessionManager.js';
import { riskService } from '$lib/domains/trading/services/RiskService.svelte.js';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { marketCmd } from '$lib/domains/market/stores/MarketCommands.js';
import { bus } from '$lib/core/events/globalBus.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import * as TRADING from '$lib/shared/constants/trading.js';

export class SystemController {

    static wakeUp() {
        if (session.lastEpic) {
            positionPoller.setEpic(session.lastEpic);
        }
        positionPoller.start();

        riskService.start();

        if (session.lastEpic) {
            marketDataPump.connect(session.lastEpic);
        }
    }

    static hibernate() {
        positionPoller.stop();

        riskService.stop();

        marketDataPump.disconnect();
    }

    static switchContext(newEpic: string) {
        if (session.lastEpic === newEpic && marketStore.isLoaded) return;

        this.hibernate();

        session.lastEpic = newEpic;

        marketStore.dispatch(marketCmd.reset(TRADING.CHART_DATA_SOURCE_BID));

        this.wakeUp();

        bus.emit(EVENTS.MARKET_SELECTED, { epic: newEpic });
    }

    static restart() {
        this.hibernate();

        if (session.lastEpic) {
            positionPoller.setEpic(session.lastEpic);
        }
        this.wakeUp();
    }
}
