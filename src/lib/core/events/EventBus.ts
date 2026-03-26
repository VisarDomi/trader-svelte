import { log } from '$lib/shared/utils/log.js';

export type EventMap = Record<string, any>;

export type EventHandler<T = any> = (payload: T) => void;

export class EventBus<Events extends EventMap> {
    private handlers: Map<keyof Events, Set<EventHandler>> = new Map();

    on<Key extends keyof Events>(type: Key, handler: EventHandler<Events[Key]>): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }

        const set = this.handlers.get(type)!;
        set.add(handler);

        return () => this.off(type, handler);
    }

    off<Key extends keyof Events>(type: Key, handler: EventHandler<Events[Key]>) {
        const set = this.handlers.get(type);
        if (set) {
            set.delete(handler);
        }
    }

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

    clear() {
        this.handlers.clear();
    }
}
