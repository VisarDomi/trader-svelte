import type { RequestHandler } from './$types';

interface LogEntry {
    event: string;
    data?: unknown;
    ts?: number;
}

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const entries: LogEntry[] = Array.isArray(body) ? body : [body];
    const now = Date.now();

    for (const { event, data, ts } of entries) {
        if (!event || typeof event !== 'string') continue;
        const delaySec = ts ? Math.round((now - ts) / 1000) : 0;
        const delayed = delaySec > 5 ? ` [delayed ${delaySec}s]` : '';
        const iso = new Date().toISOString();
        const payload = data ? JSON.stringify(data) : '';
        console.log(`${iso} [Frontend] ${event}${delayed}`, payload);
    }

    return new Response(null, { status: 204 });
};
