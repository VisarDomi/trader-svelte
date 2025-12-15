import * as API from '$lib/constants/api.js';
import * as AUTH from '$lib/constants/auth.js';

export interface AuthTokens {
    [API.CST_KEY]: string;
    [API.X_SECURITY_TOKEN_KEY]: string;
}

export interface EncryptionResponse {
    encryptionKey: string;
    timeStamp: number;
}

export class CapitalAuthService {
    private readonly fetcher: typeof fetch;

    constructor(fetcher: typeof fetch = fetch) {
        this.fetcher = fetcher;
    }

    async login(
        type: string,
        identifier: string,
        password: string,
        apiKey: string
    ): Promise<AuthTokens> {
        const baseUrl = this.getBaseUrl(type);
        const url = `${baseUrl}${API.SESSION_ENDPOINT}`;

        const response = await this.fetcher(url, {
            method: API.POST_METHOD,
            headers: {
                [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
                [API.X_CAP_API_KEY_KEY]: apiKey
            },
            body: JSON.stringify({
                [API.IDENTIFIER_KEY]: identifier,
                [API.PASSWORD_KEY]: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMessage = data[API.ERROR_CODE_KEY] || 'Login failed';
            throw new Error(errorMessage);
        }

        // Extract tokens from headers
        const cst = response.headers.get(API.CST_KEY);
        const sec = response.headers.get(API.X_SECURITY_TOKEN_KEY);

        if (!cst || !sec) {
            throw new Error('Tokens are missing from headers, go fix');
        }

        return {
            [API.CST_KEY]: cst,
            [API.X_SECURITY_TOKEN_KEY]: sec
        };
    }

    async getEncryptionKey(type: string, apiKey: string): Promise<EncryptionResponse> {
        const baseUrl = this.getBaseUrl(type);
        const url = `${baseUrl}${API.SESSION_ENDPOINT}/encryptionKey`;

        const response = await this.fetcher(url, {
            method: API.GET_METHOD,
            headers: {
                [API.X_CAP_API_KEY_KEY]: apiKey
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data[API.ERROR_CODE_KEY] || 'Failed to fetch encryption key');
        }

        return await response.json() as EncryptionResponse;
    }

    private getBaseUrl(type: string): string {
        switch (type) {
            case AUTH.DEMO_TYPE:
                return API.DEMO_BASE_URL;
            case AUTH.REAL_TYPE:
                return API.REAL_BASE_URL;
            default:
                throw new Error(`Unsupported account type: ${type}`);
        }
    }
}