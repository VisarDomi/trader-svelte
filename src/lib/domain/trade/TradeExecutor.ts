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

        const response = await createPosition(client, request);

        const confirmation = await getConfirmation(client, response.dealReference);

        session.setInitialBalance(confirmation.dealId, currentBalance);

        const newPositionBody: PositionBody = {
            contractSize: 0,
            createdDate: confirmation.date,
            createdDateUTC: confirmation.date,
            dealId: confirmation.dealId,
            dealReference: confirmation.dealReference,
            size: confirmation.size,
            leverage: 1,
            upl: 0,
            direction: confirmation.direction,
            level: confirmation.level,
            currency: currency,
            guaranteedStop: confirmation.guaranteedStop,
            stopLevel: confirmation.stopLevel,
            profitLevel: confirmation.profitLevel,
            initialBalance: currentBalance
        };

        // Construct a proper market object with identity fields
        const optimisticMarket = {
            ...market.snapshot,
            epic: market.instrument.epic,
            symbol: market.instrument.symbol,
            instrumentName: market.instrument.name
        };

        return {
            market: optimisticMarket as any,
            position: newPositionBody
        };
    }
}