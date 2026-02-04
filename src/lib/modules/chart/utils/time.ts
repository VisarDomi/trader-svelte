import { DateTime } from 'luxon';
import type { UTCTimestamp } from 'lightweight-charts';
import * as TIME from "$lib/shared/constants/time";

const fastTimeFormatter = new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/**
 * Optimized native formatter for Chart TimeScale ticks.
 * Avoids Luxon overhead in hot render loops.
 */
export function formatTimestampToLocalTime(timestamp: UTCTimestamp): string {
    return fastTimeFormatter.format(timestamp * 1000);
}

// Keep Luxon for complex formatting (popups, etc)
export function formatFullDateTime(timestamp: number): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat(TIME.DATETIME_FORMAT);
}