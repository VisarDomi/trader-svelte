import { createPosition, getConfirmation } from '$lib/services/trading.js';
import { session } from '$lib/services/session.js';
import type { ApiClient } from '$lib/api/client.js';
import type { TradeRequest, PositionResponse, PositionBody } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { PlannedTrade } from './TradePlanner.js';

export class TradeExecutor {
    async execute(
        client: ApiClient,
        trade: PlannedTrade,
        market: MarketDetailsResponse,
        currency: string,
        currentBalance: number
    ): Promise<PositionResponse> {

        const request: TradeRequest = {
            epic: market.instrument.epic,
            direction: trade.direction,
            size: trade.size,
            stopLevel: trade.stopLevel,
            profitLevel: trade.profitLevel
        };

        // 1. Send Request
        const response = await createPosition(client, request);

        // 2. Wait for Confirmation (Poll)
        const confirmation = await getConfirmation(client, response.dealReference);

        // 3. Persist Initial Balance for PnL calculations
        // We capture the balance *before* the trade logic might update it,
        // effectively locking the "Basis" for this position.
        session.setInitialBalance(confirmation.dealId, currentBalance);

        // 4. Construct the response object immediately (Optimistic UI update)
        const newPositionBody: PositionBody = {
            contractSize: 0,
            createdDate: confirmation.date,
            createdDateUTC: confirmation.date,
            dealId: confirmation.dealId,
            dealReference: confirmation.dealReference,
            size: confirmation.size,
            leverage: 1, // leverage is handled by broker, effectively 1 for display unless calculated
            upl: 0,
            direction: confirmation.direction,
            level: confirmation.level,
            currency: currency,
            guaranteedStop: confirmation.guaranteedStop,
            stopLevel: confirmation.stopLevel,
            profitLevel: confirmation.profitLevel,
            initialBalance: currentBalance
        };

        return {
            market: market.snapshot as any, // Cast to match existing types if strictness varies
            position: newPositionBody
        };
    }
}