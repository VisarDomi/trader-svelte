/** Console output — always on for DevTools debugging. */
export const log = {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

/**
 * Posts a structured event to the server log (→ journalctl on Hetzner).
 * Used at assertion points — the caller decides what reaches the server.
 * Fire-and-forget: never blocks the caller, never throws.
 */
export function serverLog(event: string, data?: Record<string, unknown>): void {
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data }),
    }).catch(() => {});
}
