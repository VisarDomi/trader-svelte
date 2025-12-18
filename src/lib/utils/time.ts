import { DateTime } from 'luxon';
import type { UTCTimestamp } from 'lightweight-charts';
import * as TIME from "$lib/constants/time";

export function formatTimestampToLocalTime(timestamp: UTCTimestamp): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat(TIME.TIME_FORMAT);
}

export function formatChartTimeFull(timestamp: UTCTimestamp): string {
    return DateTime.fromSeconds(timestamp, { zone: "system" }).toFormat(TIME.DATETIME_FORMAT);
}