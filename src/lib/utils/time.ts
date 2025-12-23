import { DateTime } from 'luxon';
import type { UTCTimestamp } from 'lightweight-charts';
import * as TIME from "$lib/constants/time";

// Cache the formatter to avoid recreation
const fastTimeFormatter = new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/**
 * High-performance formatter for Chart TimeScale.
 * Avoids Luxon overhead for tick rendering.
 */
export function formatTimestampToLocalTime(timestamp: UTCTimestamp): string {
    // fastTimeFormatter expects milliseconds
    return fastTimeFormatter.format(timestamp * 1000);
}

// Keep the specific Luxon logic for non-hot-path UI usage if needed,
// or optimize this too if used in tight loops.
export function formatFullDateTime(timestamp: number): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat(TIME.DATETIME_FORMAT);
}