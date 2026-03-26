import type { MarketDetailsResponse, MarketSummary } from '$lib/shared/types/market.js';
import type { PositionMarket } from '$lib/shared/types/trading.js';

export class MarketMapper {
    static toPositionMarket(details: MarketDetailsResponse): PositionMarket {
        const { instrument, snapshot } = details;

        return {
            instrumentName: instrument.name,
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
            updateTimeUTC: snapshot.updateTime,
            delayTime: snapshot.delayTime,
            streamingPricesAvailable: instrument.streamingPricesAvailable,
            scalingFactor: snapshot.scalingFactor,
            marketModes: snapshot.marketModes
        };
    }

    static fromSummary(summary: MarketSummary): MarketDetailsResponse {
        if (!summary) {
            throw new Error("[MarketMapper] Cannot map undefined summary");
        }

        return {
            instrument: {
                epic: summary.epic,
                symbol: summary.symbol,
                name: summary.instrumentName,
                type: summary.instrumentType,
                lotSize: summary.lotSize,
                guaranteedStopAllowed: false,
                streamingPricesAvailable: true,
                currency: "USD",
                marginFactor: 0,
                marginFactorUnit: "PERCENTAGE",
                openingHours: { zone: "UTC" },
                overnightFee: undefined
            },
            dealingRules: {
                minStepDistance: { unit: "POINTS", value: 0 },
                minDealSize: { unit: "POINTS", value: 0 },
                maxDealSize: { unit: "POINTS", value: 0 },
                minSizeIncrement: { unit: "POINTS", value: 0 },
                marketOrderPreference: "AVAILABLE",
                trailingStopsPreference: "NOT_AVAILABLE"
            },
            snapshot: {
                marketStatus: summary.marketStatus,
                netChange: summary.netChange,
                percentageChange: summary.percentageChange,
                updateTime: summary.updateTime,
                delayTime: summary.delayTime,
                bid: summary.bid,
                offer: summary.offer,
                high: summary.high,
                low: summary.low,
                decimalPlacesFactor: 2,
                scalingFactor: summary.scalingFactor,
                marketModes: summary.marketModes
            }
        };
    }
}
