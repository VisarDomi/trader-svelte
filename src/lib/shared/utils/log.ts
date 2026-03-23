/** Console output — always on for DevTools debugging. */
export const log = {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

// --- Typed Server Logging ---

interface OHLC { o: number; h: number; l: number; c: number }
interface OHLCWithTime extends OHLC { time: number }
interface PriceSnapshot { time: number; o: number; c: number }

export const LogEvent = {
    AppRestore: 'app-restore',
    ConnectSeed: 'connect-seed',
    FirstTick: 'first-tick-after-reconnect',
    SyncResult: 'sync-result',
    CandleMerge: 'candle-merge',
} as const;

export type LogEntry =
    | { tag: typeof LogEvent.AppRestore; elapsedMs: number; fromStatus: string }
    | { tag: typeof LogEvent.ConnectSeed; epic: string; bidTime: number | null; bidOHLC: OHLC | null; staleMs: number | null }
    | { tag: typeof LogEvent.FirstTick; bid: number; offer: number; liveBidTime: number | null; completedBid: PriceSnapshot | null }
    | { tag: typeof LogEvent.SyncResult; historyCandles: number; historyExtended: boolean; newestHistoryTime: number; currentFromApi: OHLCWithTime | null; liveBefore: PriceSnapshot | null; liveAfter: PriceSnapshot | null; mergeChanged: boolean }
    | { tag: typeof LogEvent.CandleMerge; time: number; before: OHLC; after: OHLC };

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
