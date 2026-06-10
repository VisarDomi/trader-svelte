import { json } from '@sveltejs/kit';
import { appendFileSync, existsSync, readFileSync } from 'fs';

const LOG_FILE = '/tmp/tick-log.csv';

if (!existsSync(LOG_FILE)) {
    appendFileSync(LOG_FILE, 'seq,unix_ms,event,epic,bid,offer,code,msg\n');
}

let seq = (() => {
    try {
        const raw = readFileSync(LOG_FILE, 'utf-8');
        const lines = raw.trim().split('\n');
        const last = lines[lines.length - 1];
        if (!last || last.startsWith('seq,')) return 0;
        return parseInt(last.split(',')[0], 10) || 0;
    } catch { return 0; }
})();

export async function POST({ request }) {
    const body = await request.json();
    const { event, epic, bid, offer, code, msg, ts } = body;
    try {
        appendFileSync(LOG_FILE, `${++seq},${ts ?? Date.now()},${event ?? ''},${epic ?? ''},${bid ?? ''},${offer ?? ''},${code ?? ''},${(msg ?? '').replace(/\n/g, '\\n')}\n`);
    } catch {}
    return json({ ok: true });
}
