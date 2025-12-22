import { DateTime } from 'luxon';
import * as CHART from '$lib/constants/chart.js';
import { formatTimestampToLocalTime } from '$lib/utils/time.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class EntryLine implements IChartLine {
    constructor(
        private readonly position: PositionBody,
        private readonly epic: string
    ) {}

    getData(isLandscape: boolean): LineData {
        return {
            price: this.position.level,
            color: CHART.STARTING_LINE_COLOR,
            title: isLandscape ? this.getLandscapeTitle() : this.getPortraitTitle()
        };
    }

    private getLandscapeTitle(): string {
        const action = this.position.direction === "BUY" ? "You bought" : "You sold";
        const timeString = this.getFormattedTime();
        const suffix = timeString ? ` at ${timeString}` : '';

        return `${action} ${this.position.size} ${this.epic}${suffix}`;
    }

    private getPortraitTitle(): string {
        const timeString = this.getFormattedTime();
        return `${this.position.size}@${timeString}`;
    }

    private getFormattedTime(): string {
        if (!this.position.createdDateUTC) return '';

        const dateSeconds = DateTime.fromISO(this.position.createdDateUTC, { zone: "utc" }).toSeconds();
        return formatTimestampToLocalTime(dateSeconds as any);
    }
}