import { DateTime } from 'luxon';
import * as CHART from '$lib/shared/constants/chart.js';
import { formatTimestampToLocalTime } from '$lib/shared/utils/time-formatters.js';
import type { PositionBody } from '$lib/shared/types/trading.js';
import type { IChartLine, LineData } from '$lib/features/chart-drawings/types';

export class EntryLine implements IChartLine {
    private readonly formattedTime: string;

    constructor(
        private readonly position: PositionBody,
        private readonly epic: string
    ) {
        if (this.position.createdDateUTC) {
            const dateSeconds = DateTime.fromISO(this.position.createdDateUTC, { zone: "utc" }).toSeconds();
            this.formattedTime = formatTimestampToLocalTime(dateSeconds as any);
        } else {
            this.formattedTime = '';
        }
    }

    getData(isLandscape: boolean): LineData {
        return {
            price: this.position.level,
            color: CHART.STARTING_LINE_COLOR,
            title: isLandscape ? this.getLandscapeTitle() : this.getPortraitTitle()
        };
    }

    private getLandscapeTitle(): string {
        const action = this.position.direction === "BUY" ? "You bought" : "You sold";
        const suffix = this.formattedTime ? ` at ${this.formattedTime}` : '';

        return `${action} ${this.position.size} ${this.epic}${suffix}`;
    }

    private getPortraitTitle(): string {
        return `${this.position.size} ${this.epic} @ ${this.formattedTime}`;
    }
}