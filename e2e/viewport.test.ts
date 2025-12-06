import { test, expect, type Page } from '@playwright/test';
import * as STORAGE from '$lib/constants/storage.js';
import * as EVENT from '$lib/constants/events.js';
import * as TEST from '$lib/constants/test.js';

async function getStoredDimensions(page: Page) {
	const keys = {
		longKey: STORAGE.MAX_LONG_KEY,
		shortKey: STORAGE.MAX_SHORT_KEY
	};

	return await page.evaluate((k) => {
		return {
			long: localStorage.getItem(k.longKey),
			short: localStorage.getItem(k.shortKey)
		};
	}, keys);
}

test.describe('Viewport Logic (iPhone 12 Pro Max)', () => {
	// iPhone 12 Pro Max Specs
	// Logical Width: 428
	// Logical Height: 926

	test('captures maximum screen real estate across rotation', async ({ page }) => {
		await page.setViewportSize({ width: TEST.PORTRAIT_SHORT, height: TEST.PORTRAIT_LONG });
		await page.goto('/');

		// Pass EVENT.WINDOW_RESIZE string to the browser
		await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), EVENT.WINDOW_RESIZE);
		await page.waitForTimeout(200);

		let dims = await getStoredDimensions(page);
		console.log('Portrait Reading:', dims);

		expect(parseFloat(dims.long!)).toBeGreaterThanOrEqual(TEST.PORTRAIT_LONG);
		expect(parseFloat(dims.short!)).toBeGreaterThanOrEqual(TEST.PORTRAIT_SHORT);

		await page.setViewportSize({ width: TEST.LANDSCAPE_LONG, height: TEST.LANDSCAPE_SHORT });

		// Pass the event strings dynamically
		await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), EVENT.WINDOW_ORIENTATION_CHANGE);
		await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), EVENT.WINDOW_RESIZE);
		await page.waitForTimeout(200);

		dims = await getStoredDimensions(page);
		console.log('Landscape Reading:', dims);

		const finalLong = parseFloat(dims.long!);
		const finalShort = parseFloat(dims.short!);

		expect(finalLong).toBe(TEST.LANDSCAPE_LONG);
		expect(finalShort).toBe(TEST.LANDSCAPE_SHORT);
	});
});