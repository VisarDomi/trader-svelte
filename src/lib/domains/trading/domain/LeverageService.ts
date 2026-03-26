import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { AccountPreferences, LeverageCategory } from '$lib/shared/types/account.js';

export class LeverageService {

    static getEffectiveLeverage(market: MarketDetailsResponse, preferences: AccountPreferences | null): number {
        const category = market.instrument.type as LeverageCategory;

        if (preferences?.leverages?.[category]) {
            return preferences.leverages[category].current;
        }

        if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {

            return Math.round(100 / market.instrument.marginFactor);
        }

        return 1;
    }
}
