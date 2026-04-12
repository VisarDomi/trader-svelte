import * as API from '$lib/shared/constants/api.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import { getBaseUrl } from "$lib/shared/utils/helpers.js";
import { DEFAULT_ERROR } from "$lib/shared/constants/error.js";
import type { URL_TYPE } from "$lib/shared/types/url.js";
import type { SessionTokens, UserCredentials } from "$lib/shared/types/auth.js";
import { session } from "$lib/core/services/SessionManager.js";
import { log } from '$lib/shared/utils/log.js';
import { getAllowedModes, isShowcaseProfile } from '$lib/core/config/runtime.js';

export async function login(type: URL_TYPE): Promise<SessionTokens> {
    const credentials: UserCredentials = session.getCredentials();
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
    if (isShowcaseProfile()) {
        const lastLogin = session.getTimestamp();
        const hasDemo = session.isAuthenticated(AUTH.DEMO_TYPE);
        const now = Date.now();
        session.mode = AUTH.DEMO_TYPE;

        if (hasDemo && (now - lastLogin < AUTH.REST_PING_INTERVAL)) {
            return;
        }

        const demoTokens = await bootstrapShowcaseSession();
        session.saveTokens(AUTH.DEMO_TYPE, demoTokens);
        session.saveLoginTimestamp();
        session.mode = AUTH.DEMO_TYPE;
        return;
    }

    session.getCredentials();

    const lastLogin = session.getTimestamp();
    const hasReal = session.isAuthenticated(AUTH.REAL_TYPE);
    const hasDemo = session.isAuthenticated(AUTH.DEMO_TYPE);
    const now = Date.now();

    if (hasReal && hasDemo && (now - lastLogin < AUTH.REST_PING_INTERVAL)) {
        return;
    }

    const [realTokens, demoTokens] = await Promise.all([login(AUTH.REAL_TYPE), login(AUTH.DEMO_TYPE)]);

    session.saveTokens(AUTH.REAL_TYPE, realTokens);
    session.saveTokens(AUTH.DEMO_TYPE, demoTokens);
    session.saveLoginTimestamp();
}

export async function bootstrapShowcaseSession(): Promise<SessionTokens> {
    const response = await fetch(AUTH.SHOWCASE_BOOTSTRAP_ENDPOINT, {
        method: API.POST_METHOD,
    });

    if (!response.ok) {
        throw new Error(DEFAULT_ERROR);
    }

    const data = await response.json() as SessionTokens;
    const cst = data[API.CST_KEY];
    const sec = data[API.X_SECURITY_TOKEN_KEY];

    if (!cst || !sec) {
        throw new Error(DEFAULT_ERROR);
    }

    return data;
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
        const promises = [];

        for (const mode of getAllowedModes()) {
            const tokens = session.getTokens(mode);
            if (tokens) {
                promises.push(ping(mode, tokens).catch(log.error));
            }
        }

        await Promise.all(promises);
    }, AUTH.REST_PING_INTERVAL);
    return () => clearInterval(intervalId);
}
