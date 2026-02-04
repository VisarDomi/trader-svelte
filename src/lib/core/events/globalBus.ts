import { EventBus } from "$lib/core/events/EventBus.js";
import type { AppEvents } from "$lib/shared/types/events.js";

/**
 * Singleton instance of the Event Bus.
 * Imported by stores/services to emit or listen.
 */
export const bus = new EventBus<AppEvents>();