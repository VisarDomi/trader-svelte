import * as API from '$lib/constants/api.js';
import * as AUTH from '$lib/constants/auth.js';
import * as STORAGE from '$lib/constants/storage.js';
import { getBaseUrl } from "$lib/utils/helpers.js";
import type { URL_TYPE } from "$lib/types/url.js";
import type { SessionTokens, UserCredentials } from "$lib/types/auth.js";
import { DEFAULT_ERROR } from "$lib/constants/error.js";
import { getCredentials } from "$lib/services/credentials.js";

export async function login(type: URL_TYPE): Promise<SessionTokens> {
    const credentials: UserCredentials = getCredentials();
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.SESSION_ENDPOINT}`;

    const response = await fetch(url, {
        method: API.POST_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
            [API.X_CAP_API_KEY_KEY]: credentials.apiKey
        },
        body: JSON.stringify({
            [API.IDENTIFIER_KEY]: credentials.identifier,
            [API.PASSWORD_KEY]: credentials.password
        })
    });

    if (!response.ok) {
        throw new Error(DEFAULT_ERROR);
    }

    const cst = response.headers.get(API.CST_KEY);
    const sec = response.headers.get(API.X_SECURITY_TOKEN_KEY);

    if (!cst || !sec) {
        throw new Error(DEFAULT_ERROR);
    }
    return {
        [API.CST_KEY]: cst,
        [API.X_SECURITY_TOKEN_KEY]: sec
    };
}

export async function authenticateAndStoreSession(): Promise<void> {
    getCredentials();

    const timestampStr = localStorage.getItem(STORAGE.LOGIN_TIMESTAMP_KEY);
    const realTokensStr = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
    const demoTokensStr = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);

    if (timestampStr && realTokensStr && demoTokensStr) {
        const timestamp = parseInt(timestampStr, 10);
        const now = Date.now();
        if (now - timestamp < 60000) {
            return;
        }
    }

    const [realTokens, demoTokens] = await Promise.all([
        login(AUTH.REAL_TYPE),
        login(AUTH.DEMO_TYPE)
    ]);

    localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(realTokens));
    localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(demoTokens));
    localStorage.setItem(STORAGE.LOGIN_TIMESTAMP_KEY, Date.now().toString());
}

async function ping(type: URL_TYPE, tokens: SessionTokens): Promise<void> {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}${API.PING_ENDPOINT}`;

    await fetch(url, {
        method: API.GET_METHOD,
        headers: {
            [API.CST_KEY]: tokens[API.CST_KEY],
            [API.X_SECURITY_TOKEN_KEY]: tokens[API.X_SECURITY_TOKEN_KEY]
        }
    });
}

export function startRestHeartbeat() {
    if (typeof window === 'undefined') return () => {};

    const intervalId = setInterval(async () => {
        const realTokensStr = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        const demoTokensStr = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);

        const promises = [];

        if (realTokensStr) {
            const tokens = JSON.parse(realTokensStr);
            promises.push(ping(AUTH.REAL_TYPE, tokens).catch(console.error));
        }

        if (demoTokensStr) {
            const tokens = JSON.parse(demoTokensStr);
            promises.push(ping(AUTH.DEMO_TYPE, tokens).catch(console.error));
        }

        await Promise.all(promises);

    }, AUTH.PING_INTERVAL);

    return () => clearInterval(intervalId);
}