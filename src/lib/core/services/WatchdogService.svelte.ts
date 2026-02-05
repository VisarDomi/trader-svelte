/**
 * Watchdog Service
 * Detects if the Javascript event loop has paused (e.g. tab backgrounded, phone locked)
 * by measuring the drift between expected execution time and actual execution time.
 */
export class WatchdogService {
    private lastTick = 0;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private readonly TOLERANCE_MS = 2500;
    private readonly TICK_MS = 1000;

    // Callback now accepts the duration of the freeze (gap)
    private onFreeze: ((gap: number) => void) | null = null;

    constructor() {}

    /**
     * Register the callback to fire when a freeze is detected.
     * Usually called by AppEngine.
     */
    setOnFreeze(callback: (gap: number) => void) {
        this.onFreeze = callback;
    }

    start() {
        this.stop();
        this.lastTick = Date.now();

        this.intervalId = setInterval(() => {
            const now = Date.now();
            const delta = now - this.lastTick;

            if (delta > (this.TICK_MS + this.TOLERANCE_MS)) {
                // Determine the actual gap size
                const gap = delta - this.TICK_MS;
                console.warn(`[Watchdog] Freeze detected. Gap: ${gap}ms`);

                if (this.onFreeze) this.onFreeze(gap);
            }

            this.lastTick = now;
        }, this.TICK_MS);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

export const watchdog = new WatchdogService();