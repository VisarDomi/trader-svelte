import type { PositionResponse } from "$lib/shared/types/trading.js";
import type { NotificationType } from "$lib/core/services/NotificationService.svelte.js";
import * as EVENTS from "$lib/shared/constants/events.js";

/**
 * Central definition of all Application Events.
 * This acts as the contract between decoupled modules.
 */
export interface AppEvents {
    // Trading Events
    [EVENTS.TRADE_EXECUTED]: PositionResponse;
    [EVENTS.TRADE_FAILED]: { reason: string };
    [EVENTS.POSITION_CLOSED]: { dealId: string, pnl: number };
    [EVENTS.POSITION_VANISHED]: void;
    [EVENTS.POSITION_UPDATED]: { dealId: string };

    // Market Events
    [EVENTS.MARKET_SELECTED]: { epic: string };
    [EVENTS.MARKET_TICK]: { bid: number, offer: number };

    // System Events
    [EVENTS.SESSION_EXPIRED]: void;
    [EVENTS.NOTIFICATION]: { type: NotificationType, message: string };

    // Input Events
    [EVENTS.INPUT_CHART_CLICK]: { price: number, time: number | null };

    // Overlay Events
    [EVENTS.OVERLAY_BLOCK_CROSSHAIR]: void;
    [EVENTS.OVERLAY_UNBLOCK_CROSSHAIR]: void;
}