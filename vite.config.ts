import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper to safely get HTTPS config
function getHttpsConfig() {
	try {
		const mkcertPath = path.join(os.homedir(), '.local/share/mkcert');
		const pwaCertPath = path.join(mkcertPath, 'pwa');
		const keyPath = path.join(pwaCertPath, 'key.pem');
		const certPath = path.join(pwaCertPath, 'cert.pem');

		if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
			return {
				key: fs.readFileSync(keyPath),
				cert: fs.readFileSync(certPath),
			};
		}
	} catch (e) {
		// Ignore errors (expected in CI/Netlify environments)
	}
	return undefined;
}

export default defineConfig({
	plugins: [sveltekit()],
	clearScreen: false,
	server: {
		host: '0.0.0.0',
		port: 24536,
		https: getHttpsConfig()
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});