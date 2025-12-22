import { ApiClient } from '$lib/api/client.js';
import { session } from '$lib/services/session.js';
import type { URL_TYPE } from '$lib/types/url.js';

class ApiService {
    // Returns a client for the current active mode (Real/Demo)
    get client(): ApiClient | null {
        const mode = session.mode;
        return this.getClientForMode(mode);
    }

    // Returns a client specifically for a requested mode
    getClientForMode(mode: URL_TYPE): ApiClient | null {
        const tokens = session.getTokens(mode);
        if (!tokens) return null;
        return new ApiClient(mode, tokens);
    }

    // specific helper for operations that require a valid session or throw
    getOrThrow(): ApiClient {
        const c = this.client;
        if (!c) throw new Error("Session expired or invalid");
        return c;
    }
}

export const api = new ApiService();