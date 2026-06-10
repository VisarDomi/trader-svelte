import type { RequestHandler } from './$types';
import { appendFileSync } from 'fs';

const LOG_FILE = '/tmp/trader-svelte-logs.ndjson';

interface LogEntry {
    event: string;
    data?: unknown;
    ts?: number;
}

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const entries: LogEntry[] = Array.isArray(body) ? body : [body];
    const now = Date.now();

    const lines: string[] = [];

    for (const { event, data, ts } of entries) {
        if (!event || typeof event !== 'string') continue;
        const delaySec = ts ? Math.round((now - ts) / 1000) : 0;
        const delayed = delaySec > 5 ? ` [delayed ${delaySec}s]` : '';
        const iso = new Date().toISOString();
        const payload = data ? JSON.stringify(data) : '';
        console.log(`${iso} [Frontend] ${event}${delayed}`, payload);
        lines.push(JSON.stringify({ time: iso, event, data, delaySec: delaySec > 5 ? delaySec : 0 }) + '\n');
    }

    try {
        appendFileSync(LOG_FILE, lines.join(''), 'utf-8');
    } catch {
        // write failure is non-critical
    }

    return new Response(null, { status: 204 });
};
