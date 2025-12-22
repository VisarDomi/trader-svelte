import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences, LeverageCategory } from '$lib/types/account.js';

export class LeverageService {
    /**
     * Determines the effective leverage for a specific market based on user preferences
     * and instrument defaults.
     */
    static getEffectiveLeverage(market: MarketDetailsResponse, preferences: AccountPreferences | null): number {
        const category = market.instrument.type as LeverageCategory;

        // 1. Check User Preferences
        if (preferences?.leverages?.[category]) {
            return preferences.leverages[category].current;
        }

        // 2. Check Instrument Defaults (Margin Factor)
        if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
            // Margin Factor 5% = 1:20 Leverage (100 / 5)
            return Math.round(100 / market.instrument.marginFactor);
        }

        // 3. Fallback (usually 1:1 or raw margin factor if not percentage)
        return 1;
    }
}