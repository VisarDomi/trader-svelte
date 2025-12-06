import { test, expect, type Page } from '@playwright/test';

async function getStoredDimensions(page: Page) {
	return await page.evaluate(() => {
		return {
			long: localStorage.getItem('MAX_LONG'),
			short: localStorage.getItem('MAX_SHORT')
		};
	});
}

test.describe('Viewport Logic (iPhone 12 Pro Max)', () => {
	// iPhone 12 Pro Max Specs
	// Logical Width: 428
	// Logical Height: 926

	test('captures maximum screen real estate across rotation', async ({ page }) => {
		// 1. Start in PORTRAIT
		// Simulating browser bars taking up some vertical space.
		// Real screen is 926 high, but visual viewport might be only ~844 due to address bar.
		await page.setViewportSize({ width: 428, height: 844 });
		await page.goto('/');

		// Force a resize event just to be safe
		await page.evaluate(() => window.dispatchEvent(new Event('resize')));
		await page.waitForTimeout(200);

		let dims = await getStoredDimensions(page);
		console.log('Portrait Reading:', dims);

		// Sanity check: Long should be at least 844, Short at least 428
		expect(parseFloat(dims.long!)).toBeGreaterThanOrEqual(844);
		expect(parseFloat(dims.short!)).toBeGreaterThanOrEqual(428);

		// 2. Rotate to LANDSCAPE
		// In landscape, the address bar often retracts or changes.
		// The width becomes the "Long" side.
		// We simulate the FULL 926 width being available now.
		await page.setViewportSize({ width: 926, height: 428 });

		// Trigger rotation event logic
		await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
		await page.evaluate(() => window.dispatchEvent(new Event('resize')));
		await page.waitForTimeout(200);

		dims = await getStoredDimensions(page);
		console.log('Landscape Reading:', dims);

		const finalLong = parseFloat(dims.long!);
		const finalShort = parseFloat(dims.short!);

		// 3. THE GRAND ASSERTION
		// The MAX_LONG should now be 926 (captured from Landscape width)
		// even though our first portrait height was only 844.
		// The scanner should have kept the larger of the two "Long" values it saw.
		expect(finalLong).toBe(926);

		// The MAX_SHORT should remain 428 (consistent across both)
		expect(finalShort).toBe(428);
	});
});