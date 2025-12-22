import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { LeverageCategory } from '$lib/types/account.js';
import type { AccountPreferences } from '$lib/types/account.js';

export class InstrumentFormatter {
    private readonly PROFIT_COLOR = '#26a69a';
    private readonly LOSS_COLOR = '#ef5350';
    private readonly TEXT_COLOR = '#d1d4dc';

    constructor(private preferences: AccountPreferences | null) {}

    getMarketStatusColor(status: string): string {
        return status === 'TRADEABLE' ? this.PROFIT_COLOR : this.LOSS_COLOR;
    }

    getNetChangeColor(netChange: number): string {
        return netChange >= 0 ? this.PROFIT_COLOR : this.LOSS_COLOR;
    }

    getLeverageDisplay(market: MarketDetailsResponse): string {
        const category = market.instrument.type as LeverageCategory;

        // 1. User Preference Override
        if (this.preferences?.leverages[category]) {
            return `1:${this.preferences.leverages[category].current}`;
        }

        // 2. Default from Instrument
        if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
            const lev = Math.round(100 / market.instrument.marginFactor);
            return `1:${lev} (Default)`;
        }

        // 3. Raw Fallback
        return `${market.instrument.marginFactor}%`;
    }

    // Helper to keep the view clean
    formatPrice(price: number, decimalPlaces: number): string {
        return price.toFixed(decimalPlaces);
    }
}