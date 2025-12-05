import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 1. Define the path to your existing mkcert certificates
// (Matches the logic from your backend)
const mkcertPath = path.join(os.homedir(), '.local/share/mkcert');
const pwaCertPath = path.join(mkcertPath, 'pwa');

export default defineConfig({
	plugins: [sveltekit()],
	clearScreen: false,
	server: {
		// 2. Listen on all network interfaces so 192.168.x.x works
		host: '0.0.0.0',
		// 3. Set the specific frontend port
		port: 24536,
		// 4. Enable HTTPS using the raw key/cert files
		https: {
			key: fs.readFileSync(path.join(pwaCertPath, 'key.pem')),
			cert: fs.readFileSync(path.join(pwaCertPath, 'cert.pem')),
		}
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