import { EventBus } from "$lib/core/events/EventBus.js";
import type { AppEvents } from "$lib/shared/types/events.js";

export const bus = new EventBus<AppEvents>();
