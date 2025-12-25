import { EventBus } from "$lib/core/EventBus.js";
import type { AppEvents } from "$lib/types/events.js";

/**
 * Singleton instance of the Event Bus.
 * Imported by stores/services to emit or listen.
 */
export const bus = new EventBus<AppEvents>();