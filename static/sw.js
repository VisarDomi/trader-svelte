const CACHE_NAME = 'pwa-v2';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
	// Only handle same-origin requests — cross-origin API calls (Capital.com)
	// must bypass the SW entirely, otherwise Firefox blocks them with CORS errors.
	// This minimal fetch handler is required for iOS 18 PWA installability.
	if (new URL(event.request.url).origin === self.location.origin) {
		event.respondWith(fetch(event.request));
	}
});
