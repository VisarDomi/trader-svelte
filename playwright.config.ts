import { defineConfig } from '@playwright/test';

export default defineConfig({
	// 1. Tell Playwright to ignore self-signed certs (mkcert)
	use: {
		ignoreHTTPSErrors: true,
		baseURL: 'https://localhost:24536',
	},
	webServer: {
		// 2. Use your existing dev command.
		// "reuseExistingServer" means if you have 'npm run dev' running in another terminal,
		// Playwright will just use that instead of starting a new one. Much faster.
		command: 'npm run dev',
		url: 'https://localhost:24536',
		reuseExistingServer: true,
		ignoreHTTPSErrors: true,
	},
	testDir: 'e2e'
});