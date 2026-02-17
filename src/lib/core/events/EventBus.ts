/**
 * A lightweight, type-safe Event Bus for decoupling stores and services.
 * Allows components to react to events (e.g., "TradeExecuted") without
 * holding references to the specific store that triggered it.
 */
import { log } from '$lib/shared/utils/log.js';


// Define the shape of our events map
export type EventMap = Record<string, any>;

// Type for the handler function
export type EventHandler<T = any> = (payload: T) => void;

export class EventBus<Events extends EventMap> {
    private handlers: Map<keyof Events, Set<EventHandler>> = new Map();

    /**
     * Subscribe to an event. Returns a cleanup function.
     */
    on<Key extends keyof Events>(type: Key, handler: EventHandler<Events[Key]>): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }

        const set = this.handlers.get(type)!;
        set.add(handler);

        return () => this.off(type, handler);
    }

    /**
     * Unsubscribe from an event.
     */
    off<Key extends keyof Events>(type: Key, handler: EventHandler<Events[Key]>) {
        const set = this.handlers.get(type);
        if (set) {
            set.delete(handler);
        }
    }

    /**
     * Emit an event to all subscribers.
     */
    emit<Key extends keyof Events>(type: Key, payload: Events[Key]) {
        const set = this.handlers.get(type);
        if (set) {
            set.forEach(handler => {
                try {
                    handler(payload);
                } catch (e) {
                    log.error(`[EventBus] Error in handler for ${String(type)}:`, e);
                }
            });
        }
    }

    /**
     * Clear all listeners (useful for testing or full resets)
     */
    clear() {
        this.handlers.clear();
    }
}