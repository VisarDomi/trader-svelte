interface OHLC { o: number; h: number; l: number; c: number }
interface OHLCWithTime extends OHLC { time: number }
interface PriceSnapshot { time: number; o: number; c: number }

export const LogEvent = {

    Boot: 'boot',
    AppRestore: 'app-restore',
    ResumeComplete: 'resume-complete',
    ResumeError: 'resume-error',

    AuthFailure: 'auth-failure',

    ConnectSeed: 'connect-seed',
    FirstTick: 'first-tick-after-reconnect',
    SyncResult: 'sync-result',
    CandleMerge: 'candle-merge',

    ResumeAttempt: 'resume-attempt',
    StateTransition: 'state-transition',

    ConnectAbort: 'connect-abort',
    StreamOpen: 'stream-open',
    StreamClose: 'stream-close',
    StreamRetry: 'stream-retry',
    StreamExhausted: 'stream-exhausted',

    HistoryPublish: 'history-publish',
    ChartRender: 'chart-render',
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
    | { tag: typeof LogEvent.StreamExhausted; epic: string; attempts: number }
    | { tag: typeof LogEvent.HistoryPublish; source: string; version: number; candles: number; oldestTime: number; newestTime: number }
    | { tag: typeof LogEvent.ChartRender; version: number; candles: number; isFirstRender: boolean; prependCount: number };

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

    flush(): void {
        void this.deliverBatch();
    }

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

    private startFlusher(): void {
        this.flushTimer = setInterval(() => void this.deliverBatch(), FLUSH_INTERVAL_MS);
    }

    private async deliverBatch(): Promise<void> {
        if (this.flushInProgress || this.buffer.length === 0) return;
        this.flushInProgress = true;

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

    private reclaimInFlight(): void {
        this.buffer = [...this.inFlight, ...this.buffer];
        this.inFlight = [];
    }

    private setupLifecycleHooks(): void {

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                queueMicrotask(() => {
                    this.persistToStorage();
                    this.beaconFlush();
                });
            }
        });
    }

    private schedulePersist(): void {
        if (this.persistQueued) return;
        this.persistQueued = true;
        queueMicrotask(() => {
            this.persistToStorage();
            this.persistQueued = false;
        });
    }

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
        } catch {  }
    }

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

function format(args: unknown[]): string {
    return args.map(a =>
        a instanceof Error ? `${a.message}${a.stack ? '\n' + a.stack : ''}`
        : typeof a === 'string' ? a
        : JSON.stringify(a)
    ).join(' ');
}

export const log = {
    info(...args: unknown[]) { logBuffer?.push('info', { message: format(args) }); },
    warn(...args: unknown[]) { logBuffer?.push('warn', { message: format(args) }); },
    error(...args: unknown[]) { logBuffer?.push('error', { message: format(args) }); },

    flush() { logBuffer?.flush(); },
};

export function serverLog(entry: LogEntry): void {
    const { tag, ...data } = entry;
    logBuffer?.push(tag, data);
}
