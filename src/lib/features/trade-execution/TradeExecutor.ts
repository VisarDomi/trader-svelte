import { createPosition, getConfirmation } from '$lib/domains/trading/services/TradeApiService.js';
import { session } from '$lib/core/services/SessionManager.js';
import { MarketMapper } from '$lib/domains/market/domain/MarketMapper.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import type { TradeRequest, PositionResponse, PositionBody } from '$lib/shared/types/trading.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { PlannedTrade } from '$lib/features/trade-execution/TradePlanner.js';

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

        const optimisticMarket = MarketMapper.toPositionMarket(market);

        return {
            market: optimisticMarket,
            position: newPositionBody
        };
    }
}
