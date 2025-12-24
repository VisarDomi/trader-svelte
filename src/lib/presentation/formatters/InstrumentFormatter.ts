import { DateTime } from 'luxon';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';
import { LeverageService } from '$lib/domain/account/LeverageService.js';

export interface GroupedHours {
    days: string;
    hours: string[];
}

interface TimeRange {
    start: DateTime;
    end: DateTime;
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

    getGroupedHours(market: MarketDetailsResponse): GroupedHours[] {
        const schedule = market.instrument.openingHours;
        const sourceZone = schedule.zone || 'UTC';

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
        const buckets: Record<number, TimeRange[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

        dayKeys.forEach((key) => {
            const rawHours = schedule[key];
            if (!rawHours || rawHours.length === 0) return;

            rawHours.forEach(range => {
                const [startStr, endStr] = range.split(' - ');
                if (!startStr || !endStr) return;

                const refDateStr = referenceWeekMap[key];

                let startDt = DateTime.fromFormat(`${refDateStr} ${startStr}`, 'yyyy-MM-dd HH:mm', { zone: sourceZone });
                let endDt = DateTime.fromFormat(`${refDateStr} ${endStr}`, 'yyyy-MM-dd HH:mm', { zone: sourceZone });

                if (endDt <= startDt) endDt = endDt.plus({ days: 1 });

                const localStart = startDt.toLocal();
                const localEnd = endDt.toLocal();

                const midnight = localStart.plus({ days: 1 }).startOf('day');

                if (localEnd > midnight) {
                    this.addToBucket(buckets, { start: localStart, end: midnight });
                    this.addToBucket(buckets, { start: midnight, end: localEnd });
                } else {
                    this.addToBucket(buckets, { start: localStart, end: localEnd });
                }
            });
        });

        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const result: GroupedHours[] = [];

        let currentGroup: { startIdx: number; endIdx: number; hoursStr: string } | null = null;

        for (let i = 0; i < 7; i++) {
            const ranges = buckets[i];

            ranges.sort((a, b) => a.start.toMillis() - b.start.toMillis());

            const mergedRanges = this.mergeRanges(ranges);

            const hoursStrings = mergedRanges.map(r => {
                return `${r.start.toFormat('HH:mm')} - ${r.end.toFormat('HH:mm')}`;
            });

            const hoursSignature = JSON.stringify(hoursStrings);

            if (hoursStrings.length === 0) {
                if (currentGroup) {
                    this.pushGroup(result, currentGroup, dayLabels);
                    currentGroup = null;
                }
                continue;
            }

            if (currentGroup && currentGroup.hoursStr === hoursSignature) {
                currentGroup.endIdx = i;
            } else {
                if (currentGroup) this.pushGroup(result, currentGroup, dayLabels);
                currentGroup = {
                    startIdx: i,
                    endIdx: i,
                    hoursStr: hoursSignature
                };
            }
        }
        if (currentGroup) this.pushGroup(result, currentGroup, dayLabels);

        return result;
    }

    private addToBucket(buckets: Record<number, TimeRange[]>, range: TimeRange) {
        const dayIdx = range.start.weekday - 1;
        const normalizedIdx = dayIdx % 7;

        if (buckets[normalizedIdx]) {
            buckets[normalizedIdx].push(range);
        }
    }

    private mergeRanges(ranges: TimeRange[]): TimeRange[] {
        if (ranges.length <= 1) return ranges;

        const merged: TimeRange[] = [];
        let current = ranges[0];

        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];

            if (current.end.toMillis() === next.start.toMillis()) {
                current = { start: current.start, end: next.end };
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
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