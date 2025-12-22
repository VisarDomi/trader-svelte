import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';
import { LeverageService } from '$lib/domain/account/LeverageService.js';

export class InstrumentFormatter {
    private readonly PROFIT_COLOR = '#26a69a';
    private readonly LOSS_COLOR = '#ef5350';

    constructor(private preferences: AccountPreferences | null) {}

    getMarketStatusColor(status: string): string {
        return status === 'TRADEABLE' ? this.PROFIT_COLOR : this.LOSS_COLOR;
    }

    getNetChangeColor(netChange: number): string {
        return netChange >= 0 ? this.PROFIT_COLOR : this.LOSS_COLOR;
    }

    getLeverageDisplay(market: MarketDetailsResponse): string {
        // Use shared domain logic
        const leverage = LeverageService.getEffectiveLeverage(market, this.preferences);

        // If the service returned a valid leverage > 1, format it
        if (leverage > 1) {
            // Check if it's a default (just for display nuance)
            // We can check if prefs exist to decide if we add "(Default)" text,
            // but strictly speaking "1:20" is cleaner.
            // Let's stick to the previous behavior of identifying defaults if useful,
            // or just standardizing.

            // Re-implementing specific "Default" label logic if needed,
            // or simplifying to just the number.
            // Let's keep it simple:
            return `1:${leverage}`;
        }

        // Fallback for non-percentage or weird cases
        return `${market.instrument.marginFactor}%`;
    }

    formatPrice(price: number, decimalPlaces: number): string {
        return price.toFixed(decimalPlaces);
    }
}