import { ApiClient } from '$lib/core/api/ApiClient.js';
import { session } from '$lib/core/services/SessionManager.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';

class ApiService {

    get client(): ApiClient | null {
        const mode = session.mode;
        return this.getClientForMode(mode);
    }

    getClientForMode(mode: URL_TYPE): ApiClient | null {
        const tokens = session.getTokens(mode);
        if (!tokens) return null;
        return new ApiClient(mode, tokens);
    }

    getOrThrow(): ApiClient {
        const c = this.client;
        if (!c) throw new Error("Session expired or invalid");
        return c;
    }
}

export const api = new ApiService();
