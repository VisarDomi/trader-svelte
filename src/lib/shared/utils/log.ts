// --- Typed Event Definitions ---

interface OHLC { o: number; h: number; l: number; c: number }
interface OHLCWithTime extends OHLC { time: number }
interface PriceSnapshot { time: number; o: number; c: number }

export const LogEvent = {
    // Lifecycle
    Boot: 'boot',
    AppRestore: 'app-restore',
    ResumeComplete: 'resume-complete',
    ResumeError: 'resume-error',
    // Auth
    AuthFailure: 'auth-failure',
    // Market data
    ConnectSeed: 'connect-seed',
    FirstTick: 'first-tick-after-reconnect',
    SyncResult: 'sync-result',
    CandleMerge: 'candle-merge',
    // Resume lifecycle
    ResumeAttempt: 'resume-attempt',
    StateTransition: 'state-transition',
    // Connection lifecycle
    ConnectAbort: 'connect-abort',
    StreamOpen: 'stream-open',
    StreamClose: 'stream-close',
    StreamRetry: 'stream-retry',
    StreamExhausted: 'stream-exhausted',
} as const;

export type LogEntry =
    | { tag: typeof LogEvent.Boot; hasTokens: boolean; hasEpic: boolean; lastEpic: string }
    | { tag: typeof LogEvent.AppRestore; elapsedMs: number; fromStatus: string }
    | { tag: typeof LogEvent.ResumeComplete; elapsedMs: number }
    | { tag: typeof LogEvent.ResumeError; error: string }
    | { tag: typeof LogEvent.AuthFailure; phase: string; error: string }
    | { tag: typeof LogEvent.ConnectSeed; epic: string; bidTime: number | null; bidOHLC: OHLC | null; staleMs: number | null }
    | { tag: typeof LogEvent.FirstTick; bid: number; offer: number; liveBidTime: number | null; completedBid: PriceSnapshot | null }
    | { tag: typeof LogEvent.SyncResult; historyCandles: number; historyExtended: boolean; newestHistoryTime: number; currentFromApi: OHLCWithTime | null; liveBefore: PriceSnapshot | null; liveAfter: PriceSnapshot | null; mergeChanged: boolean }
    | { tag: typeof LogEvent.CandleMerge; time: number; before: OHLC; after: OHLC }
    | { tag: typeof LogEvent.ResumeAttempt; source: string; status: string; elapsedMs: number; path: 'short' | 'full' | 'skipped'; reason?: string }
    | { tag: typeof LogEvent.StateTransition; from: string; to: string }
    | { tag: typeof LogEvent.ConnectAbort; reason: string; epic: string }
    | { tag: typeof LogEvent.StreamOpen; epic: string }
    | { tag: typeof LogEvent.StreamClose; epic: string; code: number; intentional: boolean }
    | { tag: typeof LogEvent.StreamRetry; epic: string; attempt: number; delayMs: number }
    | { tag: typeof LogEvent.StreamExhausted; epic: string; attempts: number };

// --- LogBuffer: single owner of all entries until delivered ---
//
// Ownership model:
//   buffer[]   — entries waiting to be sent (owned by the buffer)
//   inFlight[] — entries currently in a fetch() call (temporarily transferred)
//
// On fetch success: inFlight is dropped (entries delivered).
// On fetch failure: inFlight is reclaimed back into buffer.
// On page hide: getAllPending() (inFlight + buffer) is persisted to
//   sessionStorage and beacon-flushed — no entry is ever unowned.

const LOG_STORAGE_KEY = 'mt_log_buffer';
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFER_SIZE = 200;

interface BufferedEntry {
    event: string;
    data: unknown;
    ts: number;
}

class LogBuffer {
    private buffer: BufferedEntry[] = [];
    private inFlight: BufferedEntry[] = [];
    private flushInProgress = false;
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private persistQueued = false;

    constructor() {
        const recovered = this.recoverFromStorage();
        this.startFlusher();
        this.setupLifecycleHooks();
        if (recovered > 0) {
            this.push('log-recovery', {
                count: recovered,
                oldestTs: this.buffer[0]?.ts ?? 0,
                newestTs: this.buffer[recovered - 1]?.ts ?? 0,
            });
        }
    }

    push(event: string, data: unknown): void {
        this.buffer.push({ event, data, ts: Date.now() });
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            this.buffer.shift();
        }
        this.schedulePersist();
    }

    /** Trigger immediate delivery — call after proving network is up. */
    flush(): void {
        void this.deliverBatch();
    }

    // --- Storage Recovery ---

    private recoverFromStorage(): number {
        try {
            const raw = sessionStorage.getItem(LOG_STORAGE_KEY);
            if (!raw) return 0;
            sessionStorage.removeItem(LOG_STORAGE_KEY);
            const entries: BufferedEntry[] = JSON.parse(raw);
            if (!Array.isArray(entries) || entries.length === 0) return 0;
            this.buffer = [...entries, ...this.buffer];
            return entries.length;
        } catch {
            return 0;
        }
    }

    // --- Periodic Flush ---

    private startFlusher(): void {
        this.flushTimer = setInterval(() => void this.deliverBatch(), FLUSH_INTERVAL_MS);
    }

    private async deliverBatch(): Promise<void> {
        if (this.flushInProgress || this.buffer.length === 0) return;
        this.flushInProgress = true;

        // Transfer ownership: buffer → inFlight
        this.inFlight = this.buffer;
        this.buffer = [];

        try {
            const res = await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.inFlight),
            });
            if (res.ok) {
                this.inFlight = [];
            } else {
                this.reclaimInFlight();
            }
        } catch {
            this.reclaimInFlight();
        } finally {
            this.flushInProgress = false;
        }
    }

    /** Delivery failed — reclaim entries back into buffer. */
    private reclaimInFlight(): void {
        this.buffer = [...this.inFlight, ...this.buffer];
        this.inFlight = [];
    }

    // --- Lifecycle Hooks ---

    private setupLifecycleHooks(): void {
        // When page goes hidden (iOS freeze imminent), persist + beacon.
        // queueMicrotask ensures logs pushed by other visibilitychange handlers
        // (AppEngine, ConnectionMonitor) are captured before we flush.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                queueMicrotask(() => {
                    this.persistToStorage();
                    this.beaconFlush();
                });
            }
        });
    }

    // --- Persistence ---

    /**
     * Coalesced persist: multiple push() calls within the same microtask
     * result in a single sessionStorage write.
     */
    private schedulePersist(): void {
        if (this.persistQueued) return;
        this.persistQueued = true;
        queueMicrotask(() => {
            this.persistToStorage();
            this.persistQueued = false;
        });
    }

    /** All entries that haven't been confirmed delivered. */
    private getAllPending(): BufferedEntry[] {
        if (this.inFlight.length === 0) return this.buffer;
        if (this.buffer.length === 0) return this.inFlight;
        return [...this.inFlight, ...this.buffer];
    }

    private persistToStorage(): void {
        const all = this.getAllPending();
        try {
            if (all.length === 0) {
                sessionStorage.removeItem(LOG_STORAGE_KEY);
            } else {
                sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(all));
            }
        } catch { /* storage full — best effort */ }
    }

    /**
     * sendBeacon: browser guarantees delivery attempt even during page teardown.
     * On success, all pending entries are consumed.
     * On failure, sessionStorage still has them for next boot.
     */
    private beaconFlush(): void {
        const all = this.getAllPending();
        if (all.length === 0) return;
        const ok = navigator.sendBeacon(
            '/api/log',
            new Blob([JSON.stringify(all)], { type: 'application/json' })
        );
        if (ok) {
            this.inFlight = [];
            this.buffer = [];
            try { sessionStorage.removeItem(LOG_STORAGE_KEY); } catch {}
        }
    }
}

const logBuffer: LogBuffer | null = typeof window !== 'undefined' ? new LogBuffer() : null;

// --- Public API ---

function format(args: unknown[]): string {
    return args.map(a =>
        a instanceof Error ? `${a.message}${a.stack ? '\n' + a.stack : ''}`
        : typeof a === 'string' ? a
        : JSON.stringify(a)
    ).join(' ');
}

/** Untyped logging — for free-form diagnostic messages. */
export const log = {
    info(...args: unknown[]) { logBuffer?.push('info', { message: format(args) }); },
    warn(...args: unknown[]) { logBuffer?.push('warn', { message: format(args) }); },
    error(...args: unknown[]) { logBuffer?.push('error', { message: format(args) }); },
    /** Force immediate delivery of buffered logs. */
    flush() { logBuffer?.flush(); },
};

/**
 * Typed event logging — discriminated union guarantees every call site
 * produces a valid shape. Entries are buffered and delivered reliably.
 */
export function serverLog(entry: LogEntry): void {
    const { tag, ...data } = entry;
    logBuffer?.push(tag, data);
}
