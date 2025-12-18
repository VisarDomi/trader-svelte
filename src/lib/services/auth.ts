import * as API from '$lib/constants/api.js';
import * as AUTH_CONST from '$lib/constants/auth.js';
import * as STORAGE from '$lib/constants/storage.js';
import { getBaseUrl } from "$lib/utils/helpers";
import type { URL_TYPE } from "$lib/types/url";
import type { SessionTokens, UserCredentials } from "$lib/types/auth";
import { DEFAULT_ERROR } from "$lib/constants/error";
import { getCredentials } from "$lib/services/credentials";

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

    const [realTokens, demoTokens] = await Promise.all([
        login(AUTH_CONST.REAL_TYPE),
        login(AUTH_CONST.DEMO_TYPE)
    ]);

    localStorage.setItem(STORAGE.TOKENS_REAL_KEY, JSON.stringify(realTokens));
    localStorage.setItem(STORAGE.TOKENS_DEMO_KEY, JSON.stringify(demoTokens));
}