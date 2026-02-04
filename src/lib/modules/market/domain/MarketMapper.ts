import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { PositionMarket } from '$lib/shared/types/trading.js';

export class MarketMapper {
    static toPositionMarket(details: MarketDetailsResponse): PositionMarket {
        const { instrument, snapshot } = details;

        return {
            instrumentName: instrument.name,
            // Expiry is often not present in the stream snapshot but required by PositionMarket type.
            // We use a safe fallback.
            expiry: "-",
            marketStatus: snapshot.marketStatus,
            epic: instrument.epic,
            symbol: instrument.symbol,
            instrumentType: instrument.type,
            lotSize: instrument.lotSize,
            high: snapshot.high,
            low: snapshot.low,
            percentageChange: snapshot.percentageChange,
            netChange: snapshot.netChange,
            bid: snapshot.bid,
            offer: snapshot.offer,
            updateTime: snapshot.updateTime,
            // Map snapshot time to the expected updateTimeUTC field
            updateTimeUTC: snapshot.updateTime,
            delayTime: snapshot.delayTime,
            streamingPricesAvailable: instrument.streamingPricesAvailable,
            scalingFactor: snapshot.scalingFactor,
            marketModes: snapshot.marketModes
        };
    }
}