import * as BACKEND from './constants/backend.js';
import * as API from './constants/api.js';

export interface AuthTokens {
    [API.CST_KEY]: string;
    [API.X_SECURITY_TOKEN_KEY]: string;
}

export async function login(type: 'REAL' | 'DEMO'): Promise<AuthTokens> {
    const url = `${BACKEND.URL}${BACKEND.LOGIN}`;

    const res = await fetch(url, {
        method: API.POST_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE
        },
        body: JSON.stringify({ type })
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Login failed');
    }

    return data as AuthTokens;
}