import * as API from '$lib/shared/constants/api.js';
import { getBaseUrl } from '$lib/shared/utils/helpers.js';
import { DEFAULT_ERROR } from '$lib/shared/constants/error.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';

// --- Error Classes ---

export class NetworkError extends Error {
    constructor(message: string = "Network request failed") {
        super(message);
        this.name = "NetworkError";
    }
}

export class AuthError extends Error {
    constructor(message: string = "Session invalid or expired") {
        super(message);
        this.name = "AuthError";
    }
}

export class ApiError extends Error {
    constructor(public code: string, message?: string) {
        super(message || code);
        this.name = "ApiError";
    }
}

// --- Client ---

export class ApiClient {
    private readonly baseUrl: string;

    constructor(
        private type: URL_TYPE,
        private tokens: SessionTokens
    ) {
        this.baseUrl = getBaseUrl(type);
    }

    private async request<T>(method: string, endpoint: string, body?: unknown, params?: Record<string, string>): Promise<T> {
        let url = `${this.baseUrl}${endpoint}`;

        if (params) {
            const qs = new URLSearchParams(params).toString();
            url += `?${qs}`;
        }

        const headers: HeadersInit = {
            [API.CST_KEY]: this.tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: this.tokens[API.X_SECURITY_TOKEN_KEY]
        };

        if (body) {
            headers[API.CONTENT_TYPE_KEY] = API.APPLICATION_JSON_CONTENT_TYPE;
        }

        let response: Response;

        try {
            response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (e) {
            // Fetch only throws on network failure (DNS, Offline, etc), not 4xx/5xx
            throw new NetworkError(e instanceof Error ? e.message : "Connection failed");
        }

        if (!response.ok) {
            // Handle Authentication Errors Specifically
            if (response.status === 401 || response.status === 403) {
                throw new AuthError();
            }

            // Handle API Logic Errors
            const errorData = await response.json().catch(() => ({}));
            throw new ApiError(errorData.errorCode || DEFAULT_ERROR);
        }

        return await response.json() as T;
    }

    get<T>(endpoint: string, params?: Record<string, string>) {
        return this.request<T>(API.GET_METHOD, endpoint, undefined, params);
    }

    post<T>(endpoint: string, body: unknown) {
        return this.request<T>(API.POST_METHOD, endpoint, body);
    }

    put<T>(endpoint: string, body: unknown) {
        return this.request<T>(API.PUT_METHOD, endpoint, body);
    }
}