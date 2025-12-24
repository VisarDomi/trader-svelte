import { DateTime } from 'luxon';
import type { MarketDetailsResponse } from '$lib/types/market.js';
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

    getNextChargeTime(market: MarketDetailsResponse): string {
        const ts = market.instrument.overnightFee?.swapChargeTimestamp;
        if (!ts) return '—';
        return DateTime.fromMillis(ts).toLocal().toFormat('dd MMM HH:mm');
    }

    /**
     * Parses, groups, and shifts trading hours to the user's local timezone.
     * Uses a reference week (Jan 1 2024 was a Monday) to handle day-boundary crossings correctly.
     */
    getGroupedHours(market: MarketDetailsResponse): GroupedHours[] {
        const schedule = market.instrument.openingHours;
        const sourceZone = schedule.zone || 'UTC';

        // Map API keys to a specific reference date (Mon Jan 01 2024 to Sun Jan 07 2024)
        // This ensures Luxon handles "Monday 23:00 UTC" -> "Tuesday 01:00 Local" correctly.
        const referenceWeekMap: Record<string, string> = {
            'mon': '2024-01-01',
            'tue': '2024-01-02',
            'wed': '2024-01-03',
            'thu': '2024-01-04',
            'fri': '2024-01-05',
            'sat': '2024-01-06',
            'sun': '2024-01-07'
        };

        const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
        // Storage for re-bucketed local hours (0=Mon, 6=Sun)
        // We use a map to handle wrapping (e.g. Sunday night becoming Monday morning)
        const localBuckets: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

        dayKeys.forEach((key) => {
            const rawHours = schedule[key];
            if (!rawHours || rawHours.length === 0) return;

            rawHours.forEach(range => {
                const [startStr, endStr] = range.split(' - ');
                if (!startStr || !endStr) return;

                const refDateStr = referenceWeekMap[key];

                // Parse Start Time in Source Zone
                let startDt = DateTime.fromFormat(`${refDateStr} ${startStr}`, 'yyyy-MM-dd HH:mm', { zone: sourceZone });

                // Parse End Time in Source Zone
                // If endStr is "00:00", we treat it as the next day's midnight if it's conceptually "after" start
                let endDt = DateTime.fromFormat(`${refDateStr} ${endStr}`, 'yyyy-MM-dd HH:mm', { zone: sourceZone });

                // Handle wrapping (e.g. 23:00 - 00:00 or 23:00 - 02:00)
                if (endDt <= startDt) {
                    endDt = endDt.plus({ days: 1 });
                }

                // Convert to Local
                const localStart = startDt.toLocal();
                const localEnd = endDt.toLocal();

                const formattedRange = `${localStart.toFormat('HH:mm')} - ${localEnd.toFormat('HH:mm')}`;

                // Determine which bucket (Day of week) this falls into LOCALLY
                // Luxon weekday: 1=Mon, 7=Sun. We map to 0-6 index.
                const localDayIndex = localStart.weekday - 1;

                // If the shift moved it to a different week (rare edge case with reference dates), normalize it
                // But since we use Jan 1-7, it stays within boundaries mostly.
                // Just use valid 0-6 index.
                if (localBuckets[localDayIndex]) {
                    localBuckets[localDayIndex].push(formattedRange);
                }
            });
        });

        // Convert buckets to grouped array
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const result: GroupedHours[] = [];

        let currentGroup: { startIdx: number; endIdx: number; hoursStr: string } | null = null;

        for (let i = 0; i < 7; i++) {
            const hours = localBuckets[i];

            // Sort hours for consistency (e.g. 09:00 before 14:00)
            hours.sort();
            const hoursSignature = JSON.stringify(hours);

            if (hours.length === 0) {
                // If we have an active group, close it
                if (currentGroup) {
                    this.pushGroup(result, currentGroup, dayLabels);
                    currentGroup = null;
                }
                continue;
            }

            if (currentGroup && currentGroup.hoursStr === hoursSignature) {
                // Extend
                currentGroup.endIdx = i;
            } else {
                // Close prev
                if (currentGroup) this.pushGroup(result, currentGroup, dayLabels);
                // Start new
                currentGroup = {
                    startIdx: i,
                    endIdx: i,
                    hoursStr: hoursSignature
                };
            }
        }
        // Close final
        if (currentGroup) this.pushGroup(result, currentGroup, dayLabels);

        return result;
    }

    private pushGroup(result: GroupedHours[], group: { startIdx: number, endIdx: number, hoursStr: string }, labels: string[]) {
        const startName = labels[group.startIdx];
        const endName = labels[group.endIdx];
        const days = group.startIdx === group.endIdx ? startName : `${startName}-${endName}`;

        result.push({
            days,
            hours: JSON.parse(group.hoursStr)
        });
    }
}