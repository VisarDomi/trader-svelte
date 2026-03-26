import { DateTime } from 'luxon';
import type { UTCTimestamp } from 'lightweight-charts';
import * as TIME from "$lib/shared/constants/time";

const fastTimeFormatter = new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

export function formatTimestampToLocalTime(timestamp: UTCTimestamp): string {
    return fastTimeFormatter.format(timestamp * 1000);
}

export function formatFullDateTime(timestamp: number): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat(TIME.DATETIME_FORMAT);
}
