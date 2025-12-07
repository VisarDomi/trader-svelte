import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Chart from './Chart.svelte';
import * as CHART from '$lib/constants/chart.js';
import * as TEST from '$lib/constants/test.js';

describe('Chart Component', () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ([
                { time: '2023-12-25', open: 100, high: 105, low: 99, close: 102 }
            ])
        });
    });

    it('renders the container and initializes the library', async () => {
        render(Chart);

        const el = document.getElementById(CHART.CHART_CONTAINER_ID);
        expect(el).not.toBeNull();

        const container = page.elementLocator(el!);
        await expect.element(container).toBeInTheDocument();

        await expect.poll(() => el!.querySelector('canvas')).toBeTruthy();
    });

    it('fetches historical data using the correct API endpoint', async () => {
        render(Chart);

        await expect.poll(() => fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(CHART.CHART_CANDLES_ENDPOINT),
            expect.anything()
        );
    });

    it('fills the whole iphone real estate', async () => {
        await page.viewport(TEST.PORTRAIT_SHORT, TEST.PORTRAIT_LONG);

        render(Chart);

        const el = document.getElementById(CHART.CHART_CONTAINER_ID);
        expect(el).not.toBeNull();

        const rect = el!.getBoundingClientRect();

        expect(rect.width).toBe(TEST.PORTRAIT_SHORT);
        expect(rect.height).toBe(TEST.PORTRAIT_LONG);
    });
});