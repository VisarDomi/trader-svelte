import type { PositionResponse } from "$lib/shared/types/trading.js";
import type { NotificationType } from "$lib/core/services/NotificationService.svelte.js";
import * as EVENTS from "$lib/shared/constants/events.js";

export interface AppEvents {

    [EVENTS.TRADE_EXECUTED]: PositionResponse & { marginUsed: number };
    [EVENTS.TRADE_FAILED]: { reason: string };
    [EVENTS.POSITION_CLOSED]: { dealId: string, pnl: number };
    [EVENTS.POSITION_VANISHED]: void;
    [EVENTS.POSITION_UPDATED]: { dealId: string };

    [EVENTS.MARKET_SELECTED]: { epic: string };
    [EVENTS.MARKET_TICK]: { bid: number, offer: number };

    [EVENTS.SESSION_EXPIRED]: void;
    [EVENTS.NOTIFICATION]: { type: NotificationType, message: string };

    [EVENTS.INPUT_CHART_CLICK]: { price: number, time: number | null };

    [EVENTS.OVERLAY_BLOCK_CROSSHAIR]: void;
    [EVENTS.OVERLAY_UNBLOCK_CROSSHAIR]: void;
}
