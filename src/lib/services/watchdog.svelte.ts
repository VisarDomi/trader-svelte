/**
 * Watchdog Service
 * Detects if the Javascript event loop has paused (e.g. tab backgrounded, phone locked)
 * by measuring the drift between expected execution time and actual execution time.
 */

export class Watchdog {
    private lastTick = 0;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private readonly TOLERANCE_MS = 2500; // 2.5s tolerance
    private readonly TICK_MS = 1000;

    // Callback to execute when a gap is detected
    private onFreeze: (() => void) | null = null;

    constructor(onFreezeCallback: () => void) {
        this.onFreeze = onFreezeCallback;
    }

    start() {
        this.stop();
        this.lastTick = Date.now();

        this.intervalId = setInterval(() => {
            const now = Date.now();
            const delta = now - this.lastTick;

            // If the time passed is significantly larger than the interval + tolerance
            if (delta > (this.TICK_MS + this.TOLERANCE_MS)) {
                console.warn(`[Watchdog] Freeze detected. Gap: ${delta}ms`);
                if (this.onFreeze) this.onFreeze();
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

    /**
     * Can be called manually (e.g. on visibilitychange) to force an immediate check
     * instead of waiting for the next tick.
     */
    checkNow() {
        if (!this.intervalId) return; // Don't check if not running

        const now = Date.now();
        const delta = now - this.lastTick;

        if (delta > (this.TICK_MS + this.TOLERANCE_MS)) {
            console.warn(`[Watchdog] Manual check freeze detected. Gap: ${delta}ms`);
            // Reset lastTick immediately to prevent double-firing when the interval naturally ticks
            this.lastTick = now;
            if (this.onFreeze) this.onFreeze();
        } else {
            // No freeze, but update tick to keep precision high
            this.lastTick = now;
        }
    }
}