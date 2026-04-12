import { env } from '$env/dynamic/private';
import * as API from '$lib/shared/constants/api.js';
import type { AppProfile } from '$lib/shared/types/app.js';

interface ShowcaseCredentials {
    apiKey: string;
    identifier: string;
    password: string;
}

function normalizeProfile(value: string | undefined): AppProfile {
    return value === 'showcase' ? 'showcase' : 'personal';
}

export function getAppProfile(): AppProfile {
    return normalizeProfile(env.APP_PROFILE);
}

export function getPublicAppConfig() {
    return {
        appProfile: getAppProfile(),
    };
}

export function getShowcaseCredentials(): ShowcaseCredentials {
    if (getAppProfile() !== 'showcase') {
        throw new Error('Showcase credentials requested outside showcase profile');
    }

    const apiKey = env.SHOWCASE_API_KEY ?? '';
    const identifier = env.SHOWCASE_IDENTIFIER ?? '';
    const password = env.SHOWCASE_PASSWORD ?? '';

    if (!apiKey || !identifier || !password) {
        throw new Error('Showcase credentials are not configured');
    }

    return { apiKey, identifier, password };
}

export async function createShowcaseDemoSession(): Promise<Response> {
    const credentials = getShowcaseCredentials();

    return fetch(`${API.DEMO_BASE_URL}${API.SESSION_ENDPOINT}`, {
        method: API.POST_METHOD,
        headers: {
            [API.CONTENT_TYPE_KEY]: API.APPLICATION_JSON_CONTENT_TYPE,
            [API.X_CAP_API_KEY_KEY]: credentials.apiKey,
        },
        body: JSON.stringify({
            [API.IDENTIFIER_KEY]: credentials.identifier,
            [API.PASSWORD_KEY]: credentials.password,
        }),
    });
}
