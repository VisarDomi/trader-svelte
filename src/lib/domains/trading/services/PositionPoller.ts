import { getPositions } from '$lib/domains/trading/services/TradeApiService.js';
import { resolveInitialBalance } from '$lib/domains/trading/utils/position.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { positionCmd } from '$lib/domains/trading/stores/PositionCommands.js';
import { detectBreach } from '$lib/domains/trading/domain/BreachDetector.js';
import { bus } from '$lib/core/events/globalBus.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class PositionPoller {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private currentEpic: string = "";
    private breachTriggered = false;
    private offTick: (() => void) | null = null;

    setEpic(epic: string) {
        this.currentEpic = epic;

        if (this.isRunning) {
            void this.fetchAndSync();
        }
    }

    get isRunning() {
        return this.intervalId !== null;
    }

    start() {
        this.stop();

        void this.fetchAndSync('refresh');

        this.intervalId = setInterval(() => {
            void this.fetchAndSync('poll');
        }, 15000);

        this.offTick = bus.on(EVENTS.MARKET_TICK, ({ bid, offer }) => {
            const pos = positionStore.anyActivePosition;
            if (!pos) {
                this.breachTriggered = false;
                return;
            }
            if (this.breachTriggered || positionStore.isClosing) return;

            if (detectBreach(bid, offer, pos.position)) {
                this.breachTriggered = true;
                void this.fetchAndSync('breach');
            }
        });
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.offTick) {
            this.offTick();
            this.offTick = null;
        }
        this.breachTriggered = false;
    }

    async refresh() {
        await this.fetchAndSync('refresh');
    }

    private async fetchAndSync(source: 'breach' | 'poll' | 'refresh') {

        const client = api.client;
        if (!client) return;

        const t0 = performance.now();

        try {
            const list = await getPositions(client);

            const fetchMs = Math.round(performance.now() - t0);

            if (accountStore.activeAccount) {
                for (const p of list.positions) {
                    p.position.initialBalance = resolveInitialBalance(
                        p.position,
                        accountStore.activeAccount
                    );
                }
            }

            const globalPos = list.positions[0] || null;

            const localPos = this.currentEpic
                ? list.positions.find(p => p.market.epic === this.currentEpic) || null
                : null;

            const prev = positionStore.anyActivePosition;
            if (prev && !globalPos && !positionStore.isClosing) {
                serverLog({
                    tag: LogEvent.PositionAutoClose,
                    dealId: prev.position.dealId,
                    detectionLagMs: fetchMs,
                    source,
                });
            }

            serverLog({
                tag: LogEvent.PositionPoll,
                fetchMs,
                hasPosition: globalPos !== null,
                epic: globalPos?.market.epic ?? null,
            });

            positionStore.dispatch(positionCmd.sync(globalPos, localPos));

        } catch (e) {
            log.warn('[PositionPoller] Fetch failed', e);
        }
    }
}

export const positionPoller = new PositionPoller();
