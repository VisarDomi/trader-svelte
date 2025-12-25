import type { PositionResponse } from "$lib/types/trading.js";
import type { NotificationType } from "$lib/services/notifications.svelte.js";

/**
 * Central definition of all Application Events.
 * This acts as the contract between decoupled modules.
 */
export interface AppEvents {
    // Trading Events
    "trade:executed": PositionResponse;
    "trade:failed": { reason: string };
    "position:closed": { dealId: string, pnl: number };
    "position:updated": { dealId: string };

    // Market Events
    "market:selected": { epic: string };
    "market:tick": { bid: number, offer: number };

    // System Events
    "session:expired": void;
    "notification": { type: NotificationType, message: string };
}