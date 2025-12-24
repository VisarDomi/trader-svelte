import * as API from '$lib/constants/api.js';
import { getBaseUrl } from '$lib/utils/helpers.js';
import { DEFAULT_ERROR } from '$lib/constants/error.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { SessionTokens } from '$lib/types/auth.js';

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

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.errorCode || DEFAULT_ERROR);
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