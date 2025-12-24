import { DateTime } from 'luxon';
import type { MarketDetailsResponse, MarketOpeningHours } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';
import { LeverageService } from '$lib/domain/account/LeverageService.js';

interface GroupedHours {
    days: string;
    hours: string[];
}

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
        const leverage = LeverageService.getEffectiveLeverage(market, this.preferences);
        if (leverage > 1) {
            return `1:${leverage}`;
        }
        return `${market.instrument.marginFactor}%`;
    }

    formatPrice(price: number, decimalPlaces: number): string {
        return price.toFixed(decimalPlaces);
    }

    /**
     * Formats the overnight fee next charge time to local string
     */
    getNextChargeTime(market: MarketDetailsResponse): string {
        const ts = market.instrument.overnightFee?.swapChargeTimestamp;
        if (!ts) return '—';

        return DateTime.fromMillis(ts).toLocal().toFormat('dd MMM HH:mm');
    }

    /**
     * Parses, converts to local time, and groups trading hours.
     */
    getGroupedHours(market: MarketDetailsResponse): GroupedHours[] {
        const schedule = market.instrument.openingHours;
        const sourceZone = schedule.zone || 'UTC';

        const daysMap = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const dailySchedules: { label: string; hours: string[] }[] = [];

        // 1. Convert all days to Local Time strings
        daysMap.forEach((key, index) => {
            const rawHours = schedule[key]; // string[] | undefined
            if (!rawHours || rawHours.length === 0) return; // Skip closed days

            const localHours = rawHours.map(range => this.convertRangeToLocal(range, sourceZone));
            dailySchedules.push({
                label: dayLabels[index],
                hours: localHours
            });
        });

        if (dailySchedules.length === 0) return [];

        // 2. Group consecutive identical days
        const groups: GroupedHours[] = [];
        let currentGroup: { start: string; end: string; hours: string[] } | null = null;

        for (const ds of dailySchedules) {
            const hoursStr = JSON.stringify(ds.hours);

            if (currentGroup && JSON.stringify(currentGroup.hours) === hoursStr) {
                // Extend current group
                currentGroup.end = ds.label;
            } else {
                // Push previous
                if (currentGroup) {
                    groups.push({
                        days: currentGroup.start === currentGroup.end
                            ? currentGroup.start
                            : `${currentGroup.start}-${currentGroup.end}`,
                        hours: currentGroup.hours
                    });
                }
                // Start new
                currentGroup = {
                    start: ds.label,
                    end: ds.label,
                    hours: ds.hours
                };
            }
        }

        // Push final group
        if (currentGroup) {
            groups.push({
                days: currentGroup.start === currentGroup.end
                    ? currentGroup.start
                    : `${currentGroup.start}-${currentGroup.end}`,
                hours: currentGroup.hours
            });
        }

        return groups;
    }

    private convertRangeToLocal(range: string, zone: string): string {
        // range format: "HH:mm - HH:mm"
        const [start, end] = range.split(' - ');
        if (!start || !end) return range;

        const convert = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            // We use "today" as a reference date, but keep the zone
            const dt = DateTime.utc().setZone(zone).set({ hour: h, minute: m });
            return dt.toLocal().toFormat('HH:mm');
        };

        return `${convert(start)}-${convert(end)}`;
    }
}