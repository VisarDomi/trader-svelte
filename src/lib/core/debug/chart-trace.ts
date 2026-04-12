import * as STORAGE from '$lib/shared/constants/storage.js';

const CHART_TRACE_UNTIL_KEY = `${STORAGE.STORAGE_PREFIX}chart_trace_until`;
const CHART_TRACE_DURATION_MS = 60 * 60 * 1000;

function getStoredExpiry(): number {
    if (typeof window === 'undefined') return 0;
    const raw = localStorage.getItem(CHART_TRACE_UNTIL_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

function setStoredExpiry(value: number): void {
    if (typeof window === 'undefined') return;
    if (value <= 0) {
        localStorage.removeItem(CHART_TRACE_UNTIL_KEY);
        return;
    }
    localStorage.setItem(CHART_TRACE_UNTIL_KEY, String(value));
}

export function enableChartTrace(durationMs = CHART_TRACE_DURATION_MS): void {
    setStoredExpiry(Date.now() + durationMs);
}

export function disableChartTrace(): void {
    setStoredExpiry(0);
}

export function getChartTraceRemainingMs(): number {
    const remaining = getStoredExpiry() - Date.now();
    if (remaining <= 0) {
        disableChartTrace();
        return 0;
    }
    return remaining;
}

export function isChartTraceEnabled(): boolean {
    return getChartTraceRemainingMs() > 0;
}
