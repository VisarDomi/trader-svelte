/** Forwards a message to the server log endpoint. Fire-and-forget. */
function forward(level: 'info' | 'warn' | 'error', args: unknown[]): void {
    const message = args.map(a =>
        a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)
    ).join(' ');
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: level, data: { message } }),
    }).catch(() => {});
}

/** All levels forward to server (→ journalctl). No console output. */
export const log = {
    info(...args: unknown[]) { forward('info', args); },
    warn(...args: unknown[]) { forward('warn', args); },
    error(...args: unknown[]) { forward('error', args); },
};

// --- Typed Server Logging ---

interface OHLC { o: number; h: number; l: number; c: number }
interface OHLCWithTime extends OHLC { time: number }
interface PriceSnapshot { time: number; o: number; c: number }

export const LogEvent = {
    AppRestore: 'app-restore',
    AuthFailure: 'auth-failure',
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
    | { tag: typeof LogEvent.AppRestore; elapsedMs: number; fromStatus: string }
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

/**
 * Posts a typed event to the server log (→ journalctl on Hetzner).
 * The discriminated union guarantees every call site produces a valid shape.
 * Fire-and-forget: never blocks the caller, never throws.
 */
export function serverLog(entry: LogEntry): void {
    const { tag, ...data } = entry;
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: tag, data }),
    }).catch(() => {});
}
