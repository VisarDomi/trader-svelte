import { createPosition, getConfirmation, updatePosition } from '$lib/domains/trading/services/TradeApiService.js';
import { TradePlanner } from '$lib/features/trade-execution/TradePlanner.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { Direction } from '$lib/shared/types/trading.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class TargetExecutor {
    private planner = new TradePlanner();

    async executeTarget(
        direction: Direction,
        targetPct: number,
        market: MarketDetailsResponse,
        accountBalance: number,
        leverage: number
    ): Promise<boolean> {
        const client = api.client;
        if (!client) {
            notifications.error("Session invalid");
            return false;
        }

        const entryPrice = direction === TRADING.BUY_DIRECTION
            ? market.snapshot.offer
            : market.snapshot.bid;

        // Phase 1: open position at max size, no SL/TP
        const maxSize = this.planner.calculateMaxSize(
            market, accountBalance, leverage, entryPrice
        );

        if (!maxSize) {
            notifications.error("Position size below minimum");
            return false;
        }

        serverLog({
            tag: LogEvent.TradeRequest,
            epic: market.instrument.epic,
            direction,
            size: maxSize,
        });

        try {
            // Phase 1: open
            const t0 = performance.now();
            const response = await createPosition(client, {
                epic: market.instrument.epic,
                direction,
                size: maxSize,
            });
            const t1 = performance.now();

            const confirmation = await getConfirmation(client, response.dealReference);
            const t2 = performance.now();

            const actualEntry = confirmation.level;
            const decimalPlaces = market.snapshot.decimalPlacesFactor;

            serverLog({
                tag: LogEvent.TradeOpen,
                mode: session.mode,
                balance: accountBalance,
                epic: market.instrument.epic,
                direction,
                size: maxSize,
                orderMs: Math.round(t1 - t0),
                confirmMs: Math.round(t2 - t1),
                totalMs: Math.round(t2 - t0),
                dealId: confirmation.dealId,
                entryLevel: actualEntry,
            });

            // Phase 2: set SL/TP based on actual fill price
            const { profitLevel, stopLevel } = this.planner.calculateTargetLevels(
                actualEntry, direction, targetPct, decimalPlaces
            );

            const mode = session.mode;
            const tokens = session.getTokens(mode);
            if (tokens) {
                await updatePosition(mode, tokens, confirmation.dealId, {
                    stopLevel,
                    profitLevel,
                    guaranteedStop: false,
                    trailingStop: false,
                });

                serverLog({
                    tag: LogEvent.TradePlan,
                    balance: accountBalance,
                    leverage,
                    entryPrice: actualEntry,
                    targetPrice: profitLevel,
                    rawSize: maxSize,
                    steppedSize: maxSize,
                    size: maxSize,
                    marginRequired: (maxSize * (market.instrument.lotSize || 1) * actualEntry) / leverage,
                    decimalPlaces,
                    minDealSize: market.dealingRules.minDealSize.value,
                    maxDealSize: market.dealingRules.maxDealSize.value,
                });
            }

            notifications.success(`${direction} ${maxSize} @ ${actualEntry} → Target ${profitLevel}`);
            return true;

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            serverLog({ tag: LogEvent.TradeFailed, reason: msg });
            notifications.error(msg);
            return false;
        }
    }
}
