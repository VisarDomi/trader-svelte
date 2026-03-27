import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { createPosition, updatePosition, getConfirmation } from '$lib/domains/trading/services/TradeApiService.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { TradeCalculator } from '$lib/domains/trading/domain/TradeCalculator.js';
import { PositionCmd, type PositionCommand } from './PositionCommands.js';
import { positionCmd } from './PositionCommands.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { PositionResponse } from '$lib/shared/types/trading.js';
import { log } from '$lib/shared/utils/log.js';

export class PositionStore extends BaseStore {

    activePosition = $state<PositionResponse | null>(null);

    anyActivePosition = $state<PositionResponse | null>(null);

    isClosing = $state(false);

    private calculator = new TradeCalculator();

    constructor() {
        super();
        bus.on(EVENTS.TRADE_EXECUTED, (pos) => {
            this.dispatch(positionCmd.setFromTrade(pos));
        });
    }

    dispatch(cmd: PositionCommand) {
        switch (cmd.tag) {
            case PositionCmd.Sync: {
                const prev = this.anyActivePosition;
                this.anyActivePosition = cmd.globalPos;
                this.activePosition = cmd.localPos;

                if (prev && !cmd.globalPos && !this.isClosing) {
                    session.removeInitialBalance(prev.position.dealId);
                    bus.emit(EVENTS.POSITION_VANISHED, undefined as never);
                }
                break;
            }
            case PositionCmd.SetClosing:
                this.isClosing = cmd.closing;
                break;
            case PositionCmd.ClearPositions:
                this.activePosition = null;
                this.anyActivePosition = null;
                break;
            case PositionCmd.SetFromTrade:
                this.activePosition = cmd.position;
                this.anyActivePosition = cmd.position;
                break;
        }
    }

    async close() {
        if (!this.anyActivePosition) return;

        this.dispatch(positionCmd.setClosing(true));
        notifications.info("Request sent. Waiting for confirmation...");

        const client = api.getOrThrow();

        try {
            const p = this.anyActivePosition.position;
            const marketEpic = this.anyActivePosition.market.epic;

            const oppositeDir = p.direction === TRADING.BUY_DIRECTION
                ? TRADING.SELL_DIRECTION
                : TRADING.BUY_DIRECTION;

            const res = await createPosition(client, {
                epic: marketEpic,
                direction: oppositeDir,
                size: p.size
            });

            const conf = await getConfirmation(client, res.dealReference);

            const result = this.calculator.calculatePnL(
                p.level,
                conf.level,
                p.size,
                p.direction,
                0
            );

            session.removeInitialBalance(p.dealId);
            notifications.success(`Position Closed. PnL: ${result.rawPnL.toFixed(2)}`);

            this.dispatch(positionCmd.clearPositions());

            bus.emit(EVENTS.POSITION_CLOSED, {
                dealId: p.dealId,
                pnl: result.rawPnL
            });

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.dispatch(positionCmd.setClosing(false));
        }
    }

    async updateStopLoss(newLevel: number) {
        if (!this.anyActivePosition) return;

        const mode = session.mode;
        const tokens = session.getTokens(mode);
        if (!tokens) return;

        try {
            const p = this.anyActivePosition.position;
            const payload = {
                stopLevel: newLevel,
                profitLevel: p.profitLevel,
                guaranteedStop: p.guaranteedStop,
                trailingStop: false
            };

            await updatePosition(mode, tokens, p.dealId, payload);
            notifications.success(`Stop Loss Auto-Corrected to ${newLevel}`);

        } catch (e) {
            log.error("[RiskService] Failed to auto-correct SL", e);
        }
    }
}

export const positionStore = new PositionStore();
