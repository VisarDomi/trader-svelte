import { DateTime } from 'luxon';
import type { UTCTimestamp } from 'lightweight-charts';

export function formatTimestampToLocalTime(timestamp: UTCTimestamp): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat("HH:mm");
}

export function formatChartTimeFull(timestamp: UTCTimestamp): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat("yyyy-MM-dd HH:mm");
}