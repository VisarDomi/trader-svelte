import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Chart from './Chart.svelte';
import * as CHART from '$lib/constants/chart.js';
import * as TEST from '$lib/constants/test.js';

describe('Chart Component', () => {
    const fetchMock = vi.fn();

    // FIX 1: Use stubGlobal instead of global.fetch
    // This safely mocks fetch on the window object in the browser
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

        // FIX 2: Use document + elementLocator instead of page.locator
        // Vitest Browser runs inside the page, so we can query the DOM directly
        const el = document.getElementById(CHART.CHART_CONTAINER_ID);

        // Basic safety check
        expect(el).not.toBeNull();

        // Wrap it to use Vitest's async assertions
        const container = page.elementLocator(el!);
        await expect.element(container).toBeInTheDocument();

        // Check for canvas (Lightweight charts creates a table/div structure with canvas)
        // We wait for the DOM update
        await expect.poll(() => el!.querySelector('canvas')).toBeTruthy();
    });

    it('fetches historical data using the correct API endpoint', async () => {
        render(Chart);

        await expect.poll(() => fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(CHART.CHART_CANDLES_ENDPOINT),
            expect.anything()
        );
    });

    // TDD Spec: iPhone Full Screen Logic
    it('fills the whole iphone real estate', async () => {
        // 1. Set the viewport to iPhone Dimensions (from test.ts)
        await page.viewport(TEST.PORTRAIT_SHORT, TEST.PORTRAIT_LONG);

        render(Chart);

        const el = document.getElementById(CHART.CHART_CONTAINER_ID);
        expect(el).not.toBeNull();

        // 2. Assert the container dimensions match the viewport
        // This fails now (Implementation is height: 300px), passing means you succeeded
        const rect = el!.getBoundingClientRect();

        expect(rect.width).toBe(TEST.PORTRAIT_SHORT);
        expect(rect.height).toBe(TEST.PORTRAIT_LONG);
    });
});